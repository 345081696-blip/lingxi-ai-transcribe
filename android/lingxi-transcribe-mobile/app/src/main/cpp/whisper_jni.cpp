#include <jni.h>
#include <android/log.h>
#include <whisper.h>

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#define LOG_TAG "ZeroWhisper"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

struct WhisperHandle {
    whisper_context * ctx = nullptr;
};

static void throw_error(JNIEnv * env, const std::string & message) {
    jclass exception = env->FindClass("java/lang/IllegalStateException");
    if (exception != nullptr) {
        env->ThrowNew(exception, message.c_str());
    }
}

static std::string jstring_to_string(JNIEnv * env, jstring value) {
    if (value == nullptr) return "";
    const char * chars = env->GetStringUTFChars(value, nullptr);
    if (chars == nullptr) return "";
    std::string result(chars);
    env->ReleaseStringUTFChars(value, chars);
    return result;
}

static uint16_t read_u16_le(const unsigned char * data) {
    return static_cast<uint16_t>(data[0]) | (static_cast<uint16_t>(data[1]) << 8);
}

static uint32_t read_u32_le(const unsigned char * data) {
    return static_cast<uint32_t>(data[0]) |
           (static_cast<uint32_t>(data[1]) << 8) |
           (static_cast<uint32_t>(data[2]) << 16) |
           (static_cast<uint32_t>(data[3]) << 24);
}

static bool read_exact(std::ifstream & input, char * buffer, std::streamsize size) {
    input.read(buffer, size);
    return input.gcount() == size;
}

static std::vector<float> load_wav_pcm16(const std::string & path) {
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        throw std::runtime_error("无法打开 WAV 文件");
    }

    char riff[12];
    if (!read_exact(input, riff, sizeof(riff)) ||
        std::memcmp(riff, "RIFF", 4) != 0 ||
        std::memcmp(riff + 8, "WAVE", 4) != 0) {
        throw std::runtime_error("不是有效 WAV 文件");
    }

    bool has_fmt = false;
    bool has_data = false;
    uint16_t audio_format = 0;
    uint16_t channel_count = 0;
    uint16_t bits_per_sample = 0;
    uint32_t sample_rate = 0;
    std::vector<unsigned char> pcm_bytes;

    while (input && (!has_fmt || !has_data)) {
        char chunk_header[8];
        if (!read_exact(input, chunk_header, sizeof(chunk_header))) break;

        const uint32_t chunk_size = read_u32_le(reinterpret_cast<unsigned char *>(chunk_header + 4));
        std::vector<char> chunk(chunk_size);
        if (chunk_size > 0 && !read_exact(input, chunk.data(), chunk_size)) {
            throw std::runtime_error("WAV 数据不完整");
        }
        if ((chunk_size % 2) == 1) {
            input.ignore(1);
        }

        if (std::memcmp(chunk_header, "fmt ", 4) == 0) {
            if (chunk_size < 16) throw std::runtime_error("WAV fmt 块无效");
            const auto * data = reinterpret_cast<const unsigned char *>(chunk.data());
            audio_format = read_u16_le(data);
            channel_count = read_u16_le(data + 2);
            sample_rate = read_u32_le(data + 4);
            bits_per_sample = read_u16_le(data + 14);
            has_fmt = true;
        } else if (std::memcmp(chunk_header, "data", 4) == 0) {
            pcm_bytes.assign(chunk.begin(), chunk.end());
            has_data = true;
        }
    }

    if (!has_fmt || !has_data) throw std::runtime_error("WAV 缺少 fmt 或 data 块");
    if (audio_format != 1) throw std::runtime_error("只支持 PCM WAV");
    if (bits_per_sample != 16) throw std::runtime_error("只支持 16-bit WAV");
    if (sample_rate != WHISPER_SAMPLE_RATE) throw std::runtime_error("WAV 必须是 16000Hz");
    if (channel_count < 1) throw std::runtime_error("WAV 声道数无效");

    const size_t frame_bytes = sizeof(int16_t) * channel_count;
    const size_t frame_count = pcm_bytes.size() / frame_bytes;
    std::vector<float> samples;
    samples.reserve(frame_count);

    for (size_t frame = 0; frame < frame_count; ++frame) {
        float sum = 0.0f;
        for (uint16_t channel = 0; channel < channel_count; ++channel) {
            const size_t offset = frame * frame_bytes + channel * sizeof(int16_t);
            const auto lo = pcm_bytes[offset];
            const auto hi = pcm_bytes[offset + 1];
            const int16_t sample = static_cast<int16_t>(static_cast<uint16_t>(lo) | (static_cast<uint16_t>(hi) << 8));
            sum += static_cast<float>(sample) / 32768.0f;
        }
        samples.push_back(sum / static_cast<float>(channel_count));
    }

    return samples;
}

static std::string escape_json(const std::string & value) {
    std::ostringstream output;
    for (const char c : value) {
        switch (c) {
            case '\\': output << "\\\\"; break;
            case '"': output << "\\\""; break;
            case '\b': output << "\\b"; break;
            case '\f': output << "\\f"; break;
            case '\n': output << "\\n"; break;
            case '\r': output << "\\r"; break;
            case '\t': output << "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    output << "\\u";
                    const char * hex = "0123456789abcdef";
                    output << "00" << hex[(c >> 4) & 0x0F] << hex[c & 0x0F];
                } else {
                    output << c;
                }
        }
    }
    return output.str();
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_zerocreate_transcribemobile_transcribe_WhisperNativeBridge_createContext(
        JNIEnv * env,
        jobject,
        jstring model_path
) {
    const std::string path = jstring_to_string(env, model_path);
    if (path.empty()) {
        throw_error(env, "模型路径为空");
        return 0;
    }

    whisper_context_params params = whisper_context_default_params();
    params.use_gpu = false;

    whisper_context * ctx = whisper_init_from_file_with_params(path.c_str(), params);
    if (ctx == nullptr) {
        throw_error(env, "Whisper 模型加载失败");
        return 0;
    }
    LOGI("model loaded: %s", path.c_str());

    auto * handle = new WhisperHandle();
    handle->ctx = ctx;
    return reinterpret_cast<jlong>(handle);
}

extern "C" JNIEXPORT void JNICALL
Java_com_zerocreate_transcribemobile_transcribe_WhisperNativeBridge_releaseContext(
        JNIEnv *,
        jobject,
        jlong handle_ptr
) {
    auto * handle = reinterpret_cast<WhisperHandle *>(handle_ptr);
    if (handle == nullptr) return;
    if (handle->ctx != nullptr) {
        whisper_free(handle->ctx);
        handle->ctx = nullptr;
    }
    delete handle;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_zerocreate_transcribemobile_transcribe_WhisperNativeBridge_transcribe(
        JNIEnv * env,
        jobject,
        jlong handle_ptr,
        jstring wav_path,
        jstring language_value,
        jboolean translate,
        jint thread_count
) {
    auto * handle = reinterpret_cast<WhisperHandle *>(handle_ptr);
    if (handle == nullptr || handle->ctx == nullptr) {
        throw_error(env, "Whisper 模型尚未加载");
        return nullptr;
    }

    try {
        const std::string path = jstring_to_string(env, wav_path);
        std::string language = jstring_to_string(env, language_value);
        std::transform(language.begin(), language.end(), language.begin(), ::tolower);

        std::vector<float> samples = load_wav_pcm16(path);
        if (samples.empty()) {
            throw std::runtime_error("WAV 文件没有有效音频");
        }
        LOGI(
            "transcribe start: wav=%s samples=%zu seconds=%.2f threads=%d language=%s",
            path.c_str(),
            samples.size(),
            static_cast<double>(samples.size()) / static_cast<double>(WHISPER_SAMPLE_RATE),
            std::max(1, static_cast<int>(thread_count)),
            language.empty() ? "auto" : language.c_str()
        );

        whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
        params.n_threads = std::max(1, static_cast<int>(thread_count));
        params.translate = translate == JNI_TRUE;
        params.no_context = true;
        params.no_timestamps = false;
        params.print_progress = false;
        params.print_realtime = false;
        params.print_timestamps = false;

        std::string language_storage;
        if (language.empty() || language == "auto") {
            params.language = nullptr;
            params.detect_language = true;
        } else {
            language_storage = language;
            params.language = language_storage.c_str();
            params.detect_language = false;
        }

        const int status = whisper_full(handle->ctx, params, samples.data(), static_cast<int>(samples.size()));
        if (status != 0) {
            throw std::runtime_error("Whisper 转写失败");
        }

        const int segment_count = whisper_full_n_segments(handle->ctx);
        const int language_id = whisper_full_lang_id(handle->ctx);
        const char * language_name = whisper_lang_str(language_id);
        LOGI("transcribe done: segments=%d language=%s", segment_count, language_name == nullptr ? "" : language_name);

        std::ostringstream text;
        std::ostringstream json;
        json << "{\"language\":\"" << escape_json(language_name == nullptr ? "" : language_name) << "\",";
        json << "\"segments\":[";
        for (int i = 0; i < segment_count; ++i) {
            const char * segment_text = whisper_full_get_segment_text(handle->ctx, i);
            const int64_t start_ms = whisper_full_get_segment_t0(handle->ctx, i) * 10;
            const int64_t end_ms = whisper_full_get_segment_t1(handle->ctx, i) * 10;
            const std::string part = segment_text == nullptr ? "" : segment_text;
            text << part;
            if (i > 0) json << ",";
            json << "{\"startMs\":" << start_ms
                 << ",\"endMs\":" << end_ms
                 << ",\"text\":\"" << escape_json(part) << "\"}";
        }
        json << "],\"text\":\"" << escape_json(text.str()) << "\"}";

        return env->NewStringUTF(json.str().c_str());
    } catch (const std::exception & error) {
        LOGE("%s", error.what());
        throw_error(env, error.what());
        return nullptr;
    }
}

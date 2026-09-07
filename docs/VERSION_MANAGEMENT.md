# 版本管理

本仓库作为电脑版和手机版的唯一源码版本源。

## 仓库结构

- `./`：macOS 电脑版，应用名 `零析AI 转写`。
- `android/lingxi-transcribe-mobile/`：Android 手机版，应用名 `零析AI 转写`，副标题 `零析AI 转写`。

## 版本标签

- macOS 电脑版：使用 `v主版本.次版本.修订版本`，例如 `v0.2.27`。
- Android 手机版：使用 `lingxi-android-v主版本.次版本.修订版本`，例如 `lingxi-android-v0.3.2`。

## 修改流程

以后不以本地散落源码为准，只以 GitHub 为准。

```bash
git clone https://github.com/345081696-blip/lingxi-ai-transcribe.git
cd lingxi-ai-transcribe
git pull origin main
```

修改电脑版：

```bash
# 仓库根目录就是 macOS 电脑版源码
npm install
npm start
```

修改手机版：

```bash
cd android/lingxi-transcribe-mobile
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' ANDROID_HOME="$HOME/Library/Android/sdk" ./gradlew :app:assembleDebug
```

## 发布流程

发布 macOS 电脑版：

```bash
git tag v0.2.28
git push origin v0.2.28
```

发布 Android 手机版：

```bash
git tag lingxi-android-v0.3.3
git push origin lingxi-android-v0.3.3
```

建议每个正式可测版本都创建 GitHub Release，并上传对应安装包。

## 本地清理原则

- GitHub 是唯一源码源头。
- 本地长期只保留安装包、交接说明、测试记录和必要的临时克隆。
- 清理源码目录前必须先列清单并确认。
- 不删除用户产物目录、转写结果、模型密钥、工作记录。

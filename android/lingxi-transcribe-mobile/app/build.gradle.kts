plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.zerocreate.transcribemobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.lingchuang.lingxi"
        minSdk = 26
        targetSdk = 35
        versionCode = 6
        versionName = "0.3.2-lingxi"

        ndk {
            abiFilters += listOf("arm64-v8a")
        }

        externalNativeBuild {
            cmake {
                arguments += listOf(
                    "-DCMAKE_C_FLAGS_DEBUG=-O3 -DNDEBUG",
                    "-DCMAKE_CXX_FLAGS_DEBUG=-O3 -DNDEBUG",
                    "-DCMAKE_C_FLAGS_RELEASE=-O3 -DNDEBUG",
                    "-DCMAKE_CXX_FLAGS_RELEASE=-O3 -DNDEBUG",
                )
                cppFlags += listOf("-std=c++17", "-fexceptions", "-frtti", "-O3", "-DNDEBUG")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("com.google.mlkit:text-recognition-chinese:16.0.1")
    debugImplementation("androidx.compose.ui:ui-tooling")
}

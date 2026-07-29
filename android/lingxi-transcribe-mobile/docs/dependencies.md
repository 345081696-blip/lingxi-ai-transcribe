# 依赖与许可证记录

## 已写入 Gradle 配置

- Gradle Wrapper `8.10.2`
- Android Gradle Plugin `8.7.3`
- Kotlin Android / Compose Compiler Plugin `2.0.21`
- AndroidX Activity Compose `1.10.1`
- AndroidX Core KTX `1.15.0`
- AndroidX Lifecycle Runtime KTX `2.8.7`
- Compose BOM `2024.12.01`
- Compose UI / Material3 / Tooling

来源：

- Google Maven
- Maven Central
- Gradle Plugin Portal
- Gradle GitHub release tag `v8.10.2`
- Gradle distribution service `https://services.gradle.org/distributions/gradle-8.10.2-bin.zip`

Gradle 许可证：

- Apache-2.0

用途：

- 构建原生 Android App。
- 渲染 Jetpack Compose UI。

## 后续拟引入

- whisper.cpp，MIT，作为本地转写引擎。
- Room，Apache-2.0，作为历史记录数据库。

## 模型文件规则

- tiny/base 模型放入 `app/src/main/assets/models/` 或 App 私有目录。
- 不把模型散放到项目根目录。
- 下载 small/medium 量化模型前记录来源、大小、许可证。

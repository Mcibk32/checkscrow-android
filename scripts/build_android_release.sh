#!/bin/bash
set -e

WORKSPACE_DIR="$(pwd)"
TOOLS_DIR="$WORKSPACE_DIR/.tools"
JDK_DIR="$TOOLS_DIR/jdk-21"
ANDROID_SDK_ROOT="$TOOLS_DIR/android-sdk"

mkdir -p "$TOOLS_DIR"

echo "========================================================"
echo " STEP 1: Setting up persistent OpenJDK 21"
echo "========================================================"
if [ ! -f "$JDK_DIR/bin/javac" ]; then
  echo "Downloading OpenJDK 21 to $JDK_DIR..."
  mkdir -p /tmp/jdk_dl
  curl -L -o /tmp/jdk_dl/jdk21.tar.gz "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.6%2B7/OpenJDK21U-jdk_x64_linux_hotspot_21.0.6_7.tar.gz"
  mkdir -p "$JDK_DIR"
  tar -xzf /tmp/jdk_dl/jdk21.tar.gz -C "$JDK_DIR" --strip-components=1
  rm -rf /tmp/jdk_dl
  echo "OpenJDK 21 installed successfully."
fi

export JAVA_HOME="$JDK_DIR"
export PATH="$JAVA_HOME/bin:$PATH"
java -version

echo "========================================================"
echo " STEP 2: Setting up persistent Android SDK"
echo "========================================================"
if [ ! -f "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "Downloading Android Commandline Tools..."
  mkdir -p /tmp/cmdline_dl
  curl -L -o /tmp/cmdline_dl/tools.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  unzip -q /tmp/cmdline_dl/tools.zip -d /tmp/cmdline_dl/
  mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools/latest"
  cp -r /tmp/cmdline_dl/cmdline-tools/* "$ANDROID_SDK_ROOT/cmdline-tools/latest/"
  rm -rf /tmp/cmdline_dl
  echo "Commandline tools installed."
fi

export ANDROID_HOME="$ANDROID_SDK_ROOT"
export ANDROID_SDK_ROOT="$ANDROID_SDK_ROOT"
export PATH="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools:$PATH"

if [ ! -d "$ANDROID_SDK_ROOT/platforms/android-36" ] && [ ! -d "$ANDROID_SDK_ROOT/platforms/android-35" ]; then
  echo "Installing Android SDK packages (platforms 36/35, build-tools)..."
  yes | sdkmanager --licenses > /dev/null 2>&1 || true
  sdkmanager "platform-tools" "platforms;android-36" "platforms;android-35" "build-tools;35.0.0" > /dev/null 2>&1 || true
  yes | sdkmanager --licenses > /dev/null 2>&1 || true
  echo "Android SDK packages installed."
fi

echo "Updating android/local.properties..."
echo "sdk.dir=$ANDROID_SDK_ROOT" > android/local.properties
cat android/local.properties

echo "========================================================"
echo " STEP 3: Ensuring Gradle Wrapper is valid"
echo "========================================================"
if [ ! -f "$TOOLS_DIR/gradle-8.14.3/bin/gradle" ]; then
  echo "Downloading Gradle 8.14.3..."
  mkdir -p /tmp/gradle_dl
  curl -sL -o /tmp/gradle_dl/gradle.zip "https://services.gradle.org/distributions/gradle-8.14.3-bin.zip"
  unzip -q -o /tmp/gradle_dl/gradle.zip -d "$TOOLS_DIR/"
  rm -rf /tmp/gradle_dl
fi

cd android
"$TOOLS_DIR/gradle-8.14.3/bin/gradle" wrapper --gradle-version 8.14.3
chmod +x gradlew
cd "$WORKSPACE_DIR"

echo "========================================================"
echo " STEP 4: Cleaning build and cache directories"
echo "========================================================"
rm -rf android/.gradle android/app/build android/build

echo "========================================================"
echo " STEP 5: Regenerating and binary-verifying PNG resources"
echo "========================================================"
node scripts/generate_all_android_images.cjs
node scripts/verify_android_res.cjs

echo "========================================================"
echo " STEP 6: Building Web Assets & Syncing with Capacitor"
echo "========================================================"
npm run build
npx cap sync android

echo "========================================================"
echo " STEP 7: Executing ./gradlew clean assembleRelease"
echo "========================================================"
cd android
chmod +x gradlew
./gradlew clean
./gradlew assembleRelease --stacktrace
cd "$WORKSPACE_DIR"

echo "========================================================"
echo " STEP 8: Verifying Generated Release APK"
echo "========================================================"
find android/app/build/outputs/ -type f -name "*.apk" -exec ls -la {} +

echo "=== BUILD SCRIPT FINISHED SUCCESSFULLY ==="

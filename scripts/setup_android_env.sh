#!/bin/bash
set -e

echo "=== Setting up JDK 21 and Android SDK ==="

mkdir -p /opt

# 1. Download and install Temurin OpenJDK 21 if not present
if [ ! -d "/opt/jdk-21" ] || [ ! -f "/opt/jdk-21/bin/javac" ]; then
  echo "Downloading OpenJDK 21..."
  mkdir -p /tmp/jdk
  curl -L -o /tmp/jdk/jdk21.tar.gz "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.6%2B7/OpenJDK21U-jdk_x64_linux_hotspot_21.0.6_7.tar.gz"
  mkdir -p /opt/jdk-21
  tar -xzf /tmp/jdk/jdk21.tar.gz -C /opt/jdk-21 --strip-components=1
  rm -rf /tmp/jdk
  echo "JDK 21 installed at /opt/jdk-21"
fi

export JAVA_HOME=/opt/jdk-21
export PATH=$JAVA_HOME/bin:$PATH
java -version

# 2. Download and install Android SDK commandline-tools
ANDROID_SDK_ROOT=/opt/android-sdk
mkdir -p $ANDROID_SDK_ROOT

if [ ! -f "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "Downloading Android Commandline Tools..."
  mkdir -p /tmp/cmdline-tools
  curl -L -o /tmp/cmdline-tools/cmdline-tools.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  unzip -q /tmp/cmdline-tools/cmdline-tools.zip -d /tmp/cmdline-tools/
  mkdir -p $ANDROID_SDK_ROOT/cmdline-tools/latest
  cp -r /tmp/cmdline-tools/cmdline-tools/* $ANDROID_SDK_ROOT/cmdline-tools/latest/
  rm -rf /tmp/cmdline-tools
  echo "Commandline tools installed"
fi

export ANDROID_HOME=$ANDROID_SDK_ROOT
export ANDROID_SDK_ROOT=$ANDROID_SDK_ROOT
export PATH=$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools:$PATH

# Accept licenses
echo "Accepting Android SDK licenses..."
yes | sdkmanager --licenses > /dev/null 2>&1 || true

# Install required platforms and build tools
echo "Installing platform-tools and SDK packages..."
sdkmanager "platform-tools" "platforms;android-36" "platforms;android-35" "build-tools;35.0.0" > /dev/null 2>&1 || true
yes | sdkmanager --licenses > /dev/null 2>&1 || true

# 3. Update android/local.properties
echo "sdk.dir=$ANDROID_SDK_ROOT" > android/local.properties

echo "=== Android Environment Setup Complete ==="

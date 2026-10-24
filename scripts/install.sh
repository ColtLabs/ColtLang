#!/usr/bin/env sh
set -e

# ==========================================================
#   ColtLang Native Toolchain Installer for macOS & Linux
#   https://coltlang.dev
# ==========================================================

VERSION="${COLT_VERSION:-v0.2.0}"
TARGET_DIR="${COLT_INSTALL_DIR:-$HOME/.local/bin}"
REPO="ColtLabs/ColtLang"

printf "\033[36m==========================================================\033[0m\n"
printf "\033[36m  ColtLang Native Toolchain Installer (macOS & Linux)     \033[0m\n"
printf "\033[90m  Declarative Multi-Paradigm Data Language                \033[0m\n"
printf "\033[36m==========================================================\033[0m\n"

# 1. OS & Architecture Detection
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64|aarch64)
        ASSET="colt-macos-aarch64.tar.gz"
        ;;
      x86_64)
        ASSET="colt-macos-x86_64.tar.gz"
        ;;
      *)
        printf "\033[31mError: Unsupported macOS architecture: %s\033[0m\n" "$ARCH" >&2
        exit 1
        ;;
    esac
    ;;
  Linux)
    case "$ARCH" in
      x86_64)
        ASSET="colt-linux-x86_64.tar.gz"
        ;;
      *)
        printf "\033[31mError: Unsupported Linux architecture: %s\033[0m\n" "$ARCH" >&2
        exit 1
        ;;
    esac
    ;;
  *)
    printf "\033[31mError: Unsupported operating system: %s\033[0m\n" "$OS" >&2
    exit 1
    ;;
esac

printf "Detected platform: \033[1m%s (%s)\033[0m\n" "$OS" "$ARCH"
printf "Target release asset: \033[33m%s\033[0m\n" "$ASSET"

# 2. Check for local pre-compiled binary inside repository
REPO_ROOT="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd || true)"
LOCAL_EXE="$REPO_ROOT/target/release/colt"
if [ ! -f "$LOCAL_EXE" ]; then
  LOCAL_EXE="$REPO_ROOT/target/debug/colt"
fi

mkdir -p "$TARGET_DIR"

if [ -f "$LOCAL_EXE" ] && [ -z "$COLT_FORCE_DOWNLOAD" ]; then
  printf "\033[32mFound local compiled binary at %s. Installing to %s...\033[0m\n" "$LOCAL_EXE" "$TARGET_DIR"
  cp -f "$LOCAL_EXE" "$TARGET_DIR/colt"
  chmod +x "$TARGET_DIR/colt"
else
  # 3. Remote Download & Checksum Verification
  TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t 'colt-install')"
  trap 'rm -rf "$TMP_DIR"' EXIT

  DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION/$ASSET"
  CHECKSUM_URL="https://github.com/$REPO/releases/download/$VERSION/SHA256SUMS.txt"

  printf "Downloading %s from GitHub Releases...\n" "$ASSET"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$DOWNLOAD_URL" -o "$TMP_DIR/$ASSET" || true
    curl -fsSL "$CHECKSUM_URL" -o "$TMP_DIR/SHA256SUMS.txt" || true
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$DOWNLOAD_URL" -O "$TMP_DIR/$ASSET" || true
    wget -q "$CHECKSUM_URL" -O "$TMP_DIR/SHA256SUMS.txt" || true
  else
    printf "\033[31mError: curl or wget is required to install Colt.\033[0m\n" >&2
    exit 1
  fi

  if [ ! -f "$TMP_DIR/$ASSET" ]; then
    if [ -f "$LOCAL_EXE" ]; then
      printf "\033[33mRemote download failed. Falling back to local binary %s...\033[0m\n" "$LOCAL_EXE"
      cp -f "$LOCAL_EXE" "$TARGET_DIR/colt"
      chmod +x "$TARGET_DIR/colt"
    else
      printf "\033[31mError: Failed to download %s and no local binary was found.\033[0m\n" "$ASSET" >&2
      exit 1
    fi
  else
    # 4. Checksum verification
    if [ -f "$TMP_DIR/SHA256SUMS.txt" ]; then
      printf "Verifying SHA-256 checksum...\n"
      EXPECTED_HASH="$(grep "$ASSET" "$TMP_DIR/SHA256SUMS.txt" | awk '{print $1}' || true)"
      if [ -n "$EXPECTED_HASH" ]; then
        if command -v sha256sum >/dev/null 2>&1; then
          ACTUAL_HASH="$(sha256sum "$TMP_DIR/$ASSET" | awk '{print $1}')"
        elif command -v shasum >/dev/null 2>&1; then
          ACTUAL_HASH="$(shasum -a 256 "$TMP_DIR/$ASSET" | awk '{print $1}')"
        else
          ACTUAL_HASH=""
        fi

        if [ -n "$ACTUAL_HASH" ]; then
          if [ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]; then
            printf "\033[31mSecurity Alert: Checksum mismatch for %s!\033[0m\n" "$ASSET" >&2
            printf "Expected: %s\nActual:   %s\n" "$EXPECTED_HASH" "$ACTUAL_HASH" >&2
            exit 1
          fi
          printf "\033[32m  [OK] SHA-256 checksum verified (%s)\033[0m\n" "$ACTUAL_HASH"
        fi
      fi
    fi

    # 5. Extraction
    printf "Extracting executable to %s...\n" "$TARGET_DIR"
    tar -xzf "$TMP_DIR/$ASSET" -C "$TARGET_DIR"
    chmod +x "$TARGET_DIR/colt"
  fi
fi

# 6. Verify Installation
printf "\n\033[36mVerifying Colt installation...\033[0m\n"
if "$TARGET_DIR/colt" version >/dev/null 2>&1; then
  VER_OUTPUT="$("$TARGET_DIR/colt" version)"
  printf "\033[32m  [OK] Installed executable: %s/colt\033[0m\n" "$TARGET_DIR"
  printf "\033[32m  [OK] Verified version:     %s\033[0m\n" "$VER_OUTPUT"
else
  printf "\033[31mError: Failed to invoke %s/colt.\033[0m\n" "$TARGET_DIR" >&2
  exit 1
fi

# 7. PATH Check
case ":$PATH:" in
  *":$TARGET_DIR:"*) ;;
  *)
    printf "\n\033[33mNotice: %s is not currently in your PATH.\033[0m\n" "$TARGET_DIR"
    printf "To use 'colt' from anywhere, add the following to your ~/.bashrc or ~/.zshrc:\n\n"
    printf "    export PATH=\"%s:\$PATH\"\n\n" "$TARGET_DIR"
    ;;
esac

printf "\033[32mInstallation complete! Quick Start:\033[0m\n"
printf "  colt                     # Launch interactive terminal workspace\n"
printf "  colt --help              # View available commands\n"
printf "  colt doctor              # Diagnose database connections\n"
printf "  colt run library.colt    # Execute a Colt source program\n\n"

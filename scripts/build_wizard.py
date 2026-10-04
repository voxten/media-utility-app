"""Interactive Build & Installer Wizard for Media Studio.

Run this script to build the entire desktop app and compile a Windows Setup
Wizard (.exe installer) ready for distribution and installation.

Usage:
    python scripts/build_wizard.py           # Interactive wizard
    python scripts/build_wizard.py --all     # Non-interactive complete build
    python scripts/build_wizard.py --installer-only # Only build installer from existing dist
"""

import argparse
import os
import platform
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Optional

# Enable UTF-8 and ANSI colors in Windows terminal
if sys.platform == "win32":
    os.system("")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

FRONTEND = ROOT / "frontend"
DIST = ROOT / "dist"
BUNDLE_DIR = DIST / "MediaStudio"
EXE_PATH = BUNDLE_DIR / "MediaStudio.exe"
ISS_PATH = ROOT / "packaging" / "MediaStudio.iss"
INSTALLER_DIR = DIST / "installer"

# ANSI Colors
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"


def print_banner(version: str) -> None:
    print(f"{CYAN}{BOLD}")
    print("=" * 64)
    print(f"        MEDIA STUDIO - BUILD & INSTALLER WIZARD")
    print(f"                 Wersja: {version}")
    print("=" * 64)
    print(f"{RESET}")


def get_current_version() -> str:
    try:
        init_file = ROOT / "backend" / "__init__.py"
        for line in init_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("APP_VERSION"):
                return line.split("=")[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return "0.6.0"


def get_python_exe() -> str:
    venv_py = ROOT / ".venv" / "Scripts" / "python.exe"
    if venv_py.is_file():
        return str(venv_py)
    return sys.executable


def find_iscc() -> Optional[Path]:
    """Finds Inno Setup Compiler executable."""
    which = shutil.which("iscc") or shutil.which("ISCC")
    if which:
        return Path(which)
    candidates = [
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Inno Setup 6" / "ISCC.exe",
        Path("C:/Program Files (x86)/Inno Setup 6/ISCC.exe"),
        Path("C:/Program Files/Inno Setup 6/ISCC.exe"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def install_inno_setup() -> bool:
    print(f"\n{YELLOW}Inno Setup nie jest zainstalowany. Próba automatycznej instalacji przez winget...{RESET}")
    winget = shutil.which("winget")
    if not winget:
        print(f"{RED}Nie znaleziono winget. Zainstaluj Inno Setup ręcznie ze strony: https://jrsoftware.org/isdl.php{RESET}")
        return False
    try:
        subprocess.run(
            [
                winget,
                "install",
                "--id",
                "JRSoftware.InnoSetup",
                "--silent",
                "--accept-source-agreements",
                "--accept-package-agreements",
            ],
            check=True,
        )
        print(f"{GREEN}Inno Setup zainstalowany pomyślnie!{RESET}")
        return find_iscc() is not None
    except Exception as exc:
        print(f"{RED}Błąd instalacji Inno Setup: {exc}{RESET}")
        return False


def run_command(cmd: list, cwd: Path = ROOT, desc: str = "") -> None:
    if desc:
        print(f"\n{CYAN}{BOLD}==> {desc}{RESET}")
    print(f"{YELLOW}$ {' '.join(str(c) for c in cmd)}{RESET}")
    shell = sys.platform == "win32" and cmd[0] in ("npm", "npx")
    subprocess.run(cmd, cwd=cwd, check=True, shell=shell)


def build_frontend() -> None:
    run_command(["npm", "run", "build"], cwd=FRONTEND, desc="Budowanie frontendu (Vite + React)")


def build_pyinstaller() -> None:
    spec_path = ROOT / "packaging" / "MediaStudio.spec"
    internal_frontend = BUNDLE_DIR / "_internal" / "frontend"
    if internal_frontend.is_dir():
        shutil.rmtree(internal_frontend, ignore_errors=True)
    run_command(
        [
            get_python_exe(),
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--distpath",
            str(DIST),
            "--workpath",
            str(ROOT / "build"),
            str(spec_path),
        ],
        desc="Budowanie paczki aplikacji (PyInstaller)",
    )


def run_selftest() -> bool:
    if not EXE_PATH.is_file():
        print(f"{RED}Nie znaleziono {EXE_PATH}{RESET}")
        return False
    print(f"\n{CYAN}{BOLD}==> Test integralności pakietu (Self-test){RESET}")
    report_file = DIST / "selftest_report.json"
    code = subprocess.run([str(EXE_PATH), "--selftest", str(report_file)]).returncode
    if code == 0 and report_file.is_file():
        print(f"{GREEN}Self-test zakończony sukcesem!{RESET}")
        return True
    print(f"{RED}Self-test zwrócił błąd (kod {code}){RESET}")
    return False


def build_installer(iscc_path: Path, version: str) -> Optional[Path]:
    INSTALLER_DIR.mkdir(parents=True, exist_ok=True)
    out_name = f"MediaStudio-Setup-{version}"
    cmd = [
        str(iscc_path),
        f"/DMyAppVersion={version}",
        f'/O{INSTALLER_DIR}',
        f"/F{out_name}",
        str(ISS_PATH),
    ]
    run_command(cmd, desc="Kompilacja instalatora Windows (Inno Setup)")
    installer_exe = INSTALLER_DIR / f"{out_name}.exe"
    if installer_exe.is_file():
        size_mb = installer_exe.stat().st_size / (1024 * 1024)
        print(f"\n{GREEN}{BOLD}Instalator utworzony pomyślnie:{RESET}")
        print(f"  Ścieżka: {installer_exe}")
        print(f"  Rozmiar: {size_mb:.1f} MB")
        return installer_exe
    return None


def create_portable_zip(version: str) -> Optional[Path]:
    print(f"\n{CYAN}{BOLD}==> Tworzenie archiwum Portable (.zip){RESET}")
    zip_path = DIST / f"MediaStudio-v{version}-portable.zip"
    if not BUNDLE_DIR.is_dir():
        print(f"{RED}Folder {BUNDLE_DIR} nie istnieje!{RESET}")
        return None
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in BUNDLE_DIR.rglob("*"):
            if file.is_file():
                arcname = file.relative_to(DIST)
                zf.write(file, arcname)
    size_mb = zip_path.stat().st_size / (1024 * 1024)
    print(f"{GREEN}Archiwum portable utworzone: {zip_path} ({size_mb:.1f} MB){RESET}")
    return zip_path


def ask_choice(prompt: str, choices: list[str], default: str) -> str:
    choices_str = "/".join(choices)
    while True:
        resp = input(f"{prompt} [{choices_str}] (Domyślnie: {default}): ").strip().lower()
        if not resp:
            return default.lower()
        if resp in [c.lower() for c in choices]:
            return resp
        print(f"{YELLOW}Niepoprawny wybór. Wpisz jedną z opcji: {choices_str}{RESET}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Media Studio Build & Installer Wizard")
    parser.add_argument("--all", action="store_true", help="Pełny automatyczny build bez pytań")
    parser.add_argument("--installer-only", action="store_true", help="Tylko kompilacja instalatora z gotowego dist/MediaStudio")
    parser.add_argument("--skip-selftest", action="store_true", help="Pomiń self-test")
    parser.add_argument("--version", type=str, default="", help="Wersja aplikacji")
    args = parser.parse_args()

    version = args.version or get_current_version()
    print_banner(version)

    # 1. Check tools
    py_exe = get_python_exe()
    print(f"{BOLD}Weryfikacja środowiska deweloperskiego:{RESET}")
    print(f"  Python:     {platform.python_version()} ({py_exe})")
    
    npm_path = shutil.which("npm")
    print(f"  Node/npm:   {'Dostępny' if npm_path else RED + 'Brak npm!' + RESET}")
    if not npm_path and not args.installer_only:
        sys.exit(f"{RED}Node.js / npm jest wymagany do zbudowania frontendu.{RESET}")

    iscc_path = find_iscc()
    if iscc_path:
        print(f"  Inno Setup: {GREEN}{iscc_path}{RESET}")
    else:
        print(f"  Inno Setup: {YELLOW}Nie znaleziono w standardowych ścieżkach{RESET}")
        if args.all:
            install_inno_setup()
            iscc_path = find_iscc()
        else:
            ans = ask_choice("Czy chcesz zainstalować Inno Setup automatycznie przez winget?", ["t", "n"], "t")
            if ans == "t":
                install_inno_setup()
                iscc_path = find_iscc()

    if not iscc_path:
        print(f"{RED}Uwaga: Brak Inno Setup uniemożliwi wygenerowanie instalatora Windows (.exe).{RESET}")

    # 2. Select workflow
    do_frontend = True
    do_bundle = True
    do_selftest = not args.skip_selftest
    do_installer = True
    do_portable = False

    if args.installer_only:
        do_frontend = False
        do_bundle = False
        do_selftest = False
        do_installer = True
    elif not args.all:
        print(f"\n{BOLD}Wybierz tryb pracy:{RESET}")
        print("  [1] Pełny proces: Frontend -> PyInstaller -> Self-test -> Instalator Setup.exe (Zalecane)")
        print("  [2] Tylko instalator Setup.exe (użyj istniejącego dist/MediaStudio)")
        print("  [3] Pełny proces + archiwum Portable .zip")
        print("  [4] Konfiguracja niestandardowa (krok po kroku)")
        
        mode = input("\nWybór [1-4] (Domyślnie: 1): ").strip() or "1"
        if mode == "1":
            pass  # defaults
        elif mode == "2":
            do_frontend = False
            do_bundle = False
            do_selftest = False
        elif mode == "3":
            do_portable = True
        elif mode == "4":
            custom_ver = input(f"Wersja aplikacji [{version}]: ").strip()
            if custom_ver:
                version = custom_ver
            do_frontend = ask_choice("1. Zbudować frontend (npm run build)?", ["t", "n"], "t") == "t"
            do_bundle = ask_choice("2. Zbudować paczkę PyInstaller?", ["t", "n"], "t") == "t"
            do_selftest = ask_choice("3. Uruchomić test integralności (self-test)?", ["t", "n"], "t") == "t"
            do_installer = ask_choice("4. Skompilować instalator Setup.exe (Inno Setup)?", ["t", "n"], "t") == "t"
            do_portable = ask_choice("5. Utworzyć archiwum Portable .zip?", ["t", "n"], "n") == "t"

    # 3. Execution
    print(f"\n{GREEN}{BOLD}Rozpoczynam proces budowania...{RESET}")
    
    if do_frontend:
        build_frontend()

    if do_bundle:
        build_pyinstaller()

    if do_selftest:
        run_selftest()

    installer_file = None
    if do_installer:
        if not iscc_path:
            iscc_path = find_iscc()
        if iscc_path:
            installer_file = build_installer(iscc_path, version)
        else:
            print(f"{RED}Pominięto tworzenie instalatora z powodu braku Inno Setup.{RESET}")

    portable_file = None
    if do_portable:
        portable_file = create_portable_zip(version)

    # 4. Summary & Post-actions
    print(f"\n{CYAN}{BOLD}" + "=" * 64)
    print("                 PODSUMOWANIE PROCESU BUILDA")
    print("=" * 64 + f"{RESET}")
    
    if BUNDLE_DIR.is_dir():
        print(f"  ✓ Aplikacja:  {EXE_PATH}")
    if installer_file:
        print(f"  ✓ Instalator: {installer_file}")
    if portable_file:
        print(f"  ✓ Portable:   {portable_file}")

    if installer_file and not args.all:
        print(f"\n{BOLD}Dalsze kroki:{RESET}")
        test_run = ask_choice("Czy chcesz teraz przetestować i uruchomić instalator?", ["t", "n"], "n")
        if test_run == "t":
            os.startfile(installer_file)
        
        open_folder = ask_choice("Czy otworzyć folder z instalatorem w Eksploratorze Windows?", ["t", "n"], "t")
        if open_folder == "t":
            os.startfile(INSTALLER_DIR)

    print(f"\n{GREEN}{BOLD}Zakończono pomyślnie!{RESET}\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Przerwano przez użytkownika.{RESET}")
        sys.exit(1)
    except subprocess.CalledProcessError as err:
        print(f"\n{RED}{BOLD}Błąd podczas wykonywania polecenia:{RESET} {err}")
        sys.exit(err.returncode)

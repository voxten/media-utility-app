from pathlib import Path

def porownaj_foldery(sciezka_a: str, sciezka_b: str):
    folder_a = Path(sciezka_a)
    folder_b = Path(sciezka_b)

    # Walidacja poprawności ścieżek
    if not folder_a.is_dir():
        print(f"Błąd: Ścieżka '{sciezka_a}' nie istnieje lub nie jest folderem.")
        return
    if not folder_b.is_dir():
        print(f"Błąd: Ścieżka '{sciezka_b}' nie istnieje lub nie jest folderem.")
        return

    # Pobranie nazw samych plików (z pominięciem ewentualnych podkatalogów)
    pliki_a = {f.name for f in folder_a.iterdir() if f.is_file()}
    pliki_b = {f.name for f in folder_b.iterdir() if f.is_file()}

    liczba_a = len(pliki_a)
    liczba_b = len(pliki_b)

    print("=== RAPORT PORÓWNANIA ===")
    print(f"Folder A ({folder_a.resolve()}): {liczba_a} plików")
    print(f"Folder B ({folder_b.resolve()}): {liczba_b} plików\n")

    # Informacja o liczbie plików
    if liczba_a > liczba_b:
        print(f"[!] Folder A ma o {liczba_a - liczba_b} plik(ów) więcej niż Folder B.")
    elif liczba_b > liczba_a:
        print(f"[!] Folder B ma o {liczba_b - liczba_a} plik(ów) więcej niż Folder A.")
    else:
        print("[OK] Oba foldery mają dokładnie taką samą liczbę plików.")

    # Różnice w nazwach (operacje na zbiorach)
    tylko_w_a = pliki_a - pliki_b
    tylko_w_b = pliki_b - pliki_a

    if not tylko_w_a and not tylko_w_b:
        print("[OK] Wszystkie nazwy plików w obu folderach w 100% się zgadzają.")
        return

    print("\n--- WYKRYTE ROZBIEŻNOŚCI ---")
    if tylko_w_a:
        print(f"\nPliki obecne TYLKO w Folderze A ({len(tylko_w_a)}):")
        for plik in sorted(tylko_w_a):
            print(f" - {plik}")

    if tylko_w_b:
        print(f"\nPliki obecne TYLKO w Folderze B ({len(tylko_w_b)}):")
        for plik in sorted(tylko_w_b):
            print(f" - {plik}")

if __name__ == "__main__":
    # Wpisz ścieżki do porównywanych folderów:
    FOLDER_1 = r"C:\Users\Jakub\AppData\Roaming\Crystal-Launcher\instances\u.Kotek_i_misiu_26_1_2\.minecraft\mods"
    FOLDER_2 = r"C:\Users\Jakub\curseforge\minecraft\Instances\Kotek i Misiu 26.2 (1)\mods"

    porownaj_foldery(FOLDER_1, FOLDER_2)
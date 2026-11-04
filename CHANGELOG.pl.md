# Lista zmian

Polskie tłumaczenie [CHANGELOG.md](CHANGELOG.md), pokazywane w aplikacji przy polskim języku. Każde wydanie trzeba dopisać w obu plikach.

## [0.11.0] - 2026-11-04

### Dodano

- **Wideo do GIF:** nowe narzędzie zamieniające fragment filmu w animowany GIF, WebP lub APNG: zakres wybierany na osi czasu z klatkami, liczba klatek na sekundę, szerokość, prędkość, kadrowanie i odtwarzanie od końca, z podglądem i szacowanym rozmiarem przed zapisem.
- **Edytor GIF:** nowe narzędzie do animowanych GIF, WebP i APNG: przycinanie na osi czasu, kadrowanie, zmiana rozmiaru, obrót i odbicie, prędkość, odwrócenie i bumerang; kilka plików naraz; zapis jako GIF, WebP, APNG lub MP4.
- **Wynik GIF:** liczba kolorów, dithering, liczba powtórzeń i kompresja stratna; limit rozmiaru (od 256 KB do 25 MB lub własny) zmniejsza wynik, aż się zmieści.
- **gifsicle:** opcjonalny dodatek do stratnej kompresji GIF i limitu rozmiaru, instalowany z Ustawień lub z narzędzi GIF.
- **Pobieranie z Instagrama:** nowe narzędzie zapisujące zdjęcia i filmy z posta, karuzeli, rolki, relacji, wyróżnionej relacji lub całego profilu na Instagramie w pełnej jakości; co zapisać, wybiera się z siatki podglądów, a profil trafia do folderu z nazwą konta. Relacje, profile oraz posty z ograniczeniem wiekowym lub z kont prywatnych wymagają pliku cookies Instagrama, który można teraz wskazać w Ustawieniach → Pliki cookies.
- **Pobieranie wideo:** posty ze zdjęciami (pokazy slajdów) na TikToku zapisują zdjęcia jako JPG, także z linków `/photo/` i całych profili; „Tylko audio” nadal zapisuje dźwięk.

### Zmieniono

- Eksport w Synchronizacji Audio-Wideo pokazuje rzeczywisty postęp.
- „Wyślij do” proponuje Edytor GIF dla plików GIF.
- **Instalator:** uruchomiony na zainstalowanej wersji aktualizuje ją w miejscu, zachowując ustawienia i dodatki; przed instalacją starszej wersji pyta o zgodę.

### Naprawiono

- **Pobieranie wideo:** filmy z TikToka i całe profile TikTok znów się pobierają; profil pokazuje wszystkie publiczne filmy.

---

## [0.10.0] - 2026-10-18

### Dodano

- **Podział PDF:** strony łączy się w grupy klikaniem, każda grupa ma własny kolor i zapisuje się jako osobny PDF. Shift+klik dodaje kilka stron naraz.
- **Narzędzia PDF:** siatka miniatur stron z podglądem w pełnym rozmiarze w kompresorze, podziale, konwerterze i ekstraktorze.
- **Konwerter PDF:** eksport do grafik tylko wybranych stron (klikaniem lub wpisanym zakresem).
- **Pobieranie wideo:** linki można dopisywać do trwającej kolejki; istniejące pliki nie są nadpisywane (dopisek `(1)`, `(2)`); kolejka pokazuje łączny rozmiar i czas.
- **Synchronizacja audio-wideo:** ścieżka klatek wideo na osi czasu; przyjmuje filmy przesłane z innych narzędzi.
- **Generator postępu:** wartości w procentach albo liczbach (np. 12/40), każdy pasek z własną liczbą docelową.
- **Skalowanie obrazów AI, usuwanie znaku wodnego:** „Kontynuuj z wynikiem” używa wyniku jako kolejnego wejścia.
- **Wersja instalowana:** opcjonalne pakiety AI (PyTorch, rembg) instalują się z Ustawień do folderu dodatków użytkownika; autotest sprawdza obsługę dodatków.
- **Co nowego:** lista zmian dostępna w Ustawieniach i w palecie poleceń; po aktualizacji aplikacja o niej przypomina.

### Zmieniono

- Narzędzia mają wspólny układ: strefa upuszczania, pasek plików, pasek akcji, karta wyniku i baner modelu AI.
- Okienko i panel zadań korzystają z jednej karty zadania.
- Kompresor obrazów i Narzędzia obrazu przebudowane na wspólnym pasku plików; miniatury generuje backend, a pamięć podręczna jest jedna dla całej aplikacji.
- „Prześlij do…” pokazuje tylko narzędzia, które przyjmują dany typ pliku.
- Krótsze teksty w interfejsie; nazwy formatów plików zdefiniowane w jednym miejscu.
- PyTorch ładuje się dopiero przy uruchomieniu modelu AI, więc aplikacja startuje bez niego.

### Poprawiono

- Okno „Prześlij do…” znów jest wyśrodkowane; okna dialogowe nie pustoszeją podczas zamykania.
- Polska odmiana liczebników w komunikatach PDF; tytuł karty wyniku nie zlewa się ze ścieżką.

---

## [0.9.0] - 2026-10-04

### Dodano

- **Synchronizacja audio-wideo:** nowe narzędzie do naprawy rozjechanego dźwięku: oś czasu z przebiegiem fali, przybliżaniem i przeciąganiem, precyzyjne przesunięcie, krótkie klipy podglądu i eksport przez kopię strumienia lub ponowne kodowanie do H.264/AAC.
- Dźwięk może pochodzić z samego filmu albo z osobnego pliku.

### Poprawiono

- Brakujące tłumaczenia w synchronizacji audio-wideo.

---

## [0.8.0] - 2026-10-04

### Zmieniono

- Nowe ikony usuwania tła, wyszukiwarki duplikatów, konwertera PDF i ekstraktora PDF; wszystkie ikony narzędzi PDF mają jeden styl.
- Okienko zadań: pełny panel otwiera się przyciskiem w nagłówku; „Wyczyść ukończone” pojawia się tylko, gdy jest co czyścić.

---

## [0.7.0] - 2026-10-03

### Dodano

- **Okienko zadań:** postęp całości, prędkość i pozostały czas oraz stan każdego elementu w zadaniach wsadowych.
- **Instalator:** instalator Windows po polsku i angielsku, dla jednego użytkownika bez uprawnień administratora, ze skrótami w menu Start i na pulpicie oraz deinstalatorem.

### Poprawiono

- Licznik czasu zadania startuje od razu i odlicza co sekundę.

---

## [0.6.0] - 2026-10-03

### Dodano

- **Usuwanie tła AI:** modele BiRefNet, RMBG, U2Net i IS-Net, czyszczenie krawędzi, pędzel do usuwania i przywracania oraz gotowe tła.
- **Skalowanie obrazów AI:** modele Real-ESRGAN, skala 2× i 4×, odszumianie i przetwarzanie dużych obrazów w kafelkach.
- **Modele AI w Ustawieniach:** instalacja i usuwanie pakietów oraz modeli AI bez reinstalacji aplikacji.
- **Porównanie obrazów:** suwak, obok siebie, tylko wynik i tylko oryginał.
- **Usuwanie znaku wodnego:** model AI LaMa instalowany jednym kliknięciem; wybór folderu i nazwy pliku wynikowego.

### Zmieniono

- Narzędzia obrazu pogrupowane w kategorie z oznaczeniem „AI”.

---

## [0.5.0] - 2026-10-03

### Dodano

- Panel zadań w tle z powiadomieniami.
- Paleta poleceń Ctrl+K.
- Przeciąganie plików na okno aplikacji.
- Samodzielna wersja dla Windows, która nie wymaga Pythona.

### Zmieniono

- Nowy interfejs w miejsce okna PyQt: efekt Mica z Windows 11, motyw jasny i ciemny, język polski i angielski.

---

## [0.4.0] - 2026-10-03

### Dodano

- Pobieranie wideo, zamiana tekstu na mowę z wbudowanym odtwarzaczem, wyszukiwarka duplikatów, konwerter obrazów i generator pasków postępu w nowym interfejsie.
- Łączenie PDF z ustalaniem kolejności stron przez przeciąganie.

---

## [0.3.0] - 2026-10-03

### Dodano

- Pierwsza wersja nowego interfejsu: nawigacja boczna i strona startowa.

---

## [0.2.0] - 2026-10-03

### Dodano

- **Usuwanie znaku wodnego** oparte na wypełnianiu OpenCV.

---

## [0.1.0] - 2026-08-12

### Dodano

- Pierwsza wersja: konwerter obrazów, pobieranie z YouTube, zamiana tekstu na mowę, łączenie PDF, wyszukiwarka duplikatów zdjęć i filmów oraz generator grafik pasków postępu.

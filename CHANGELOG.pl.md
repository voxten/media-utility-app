# Lista zmian

Polskie tłumaczenie [CHANGELOG.md](CHANGELOG.md), pokazywane w aplikacji przy polskim języku. Każde wydanie trzeba dopisać w obu plikach.

## [0.13.0] - 2026-11-09

### Dodano

- **Transkrypcja:** nowe narzędzie, które zamienia mowę z filmu lub nagrania na napisy SRT lub VTT albo tekst TXT, na tym komputerze i bez internetu. Samo wykrywa język albo używa wybranego, umie przetłumaczyć na angielski i pokazuje tekst z czasami do skopiowania. Korzysta z rozpoznawania mowy Whisper, pobieranego raz z Ustawień albo z narzędzia: Base (szybki), Small (zrównoważony) lub Turbo (najdokładniejszy, wolny).
- **Pobieranie wideo: napisy** zapisywane obok filmu, ze strony (w Twoim języku i po angielsku) albo, gdy strona ich nie ma, tworzone przez Whispera. Wybierasz to w „Zapis” → „Napisy”.
- **Zamykanie do zasobnika:** przycisk X chowa okno do obszaru powiadomień, a zadania dalej działają; ikona w zasobniku przywraca okno, a jej menu zamyka aplikację. Można to wyłączyć w Ustawienia → Zaawansowane → „Zamykanie do zasobnika”.
- Ponowne uruchomienie aplikacji przywraca działające okno zamiast otwierać drugą kopię.
- **Aktualizacja silnika pobierania:** nowsze yt-dlp i gallery-dl instalują się z Ustawień → „Silnik pobierania”, bez czekania na nowe wydanie aplikacji, gdy YouTube, TikTok, X albo Instagram przestaną się pobierać. Aplikacja raz dziennie przy starcie sprawdza, czy jest nowa wersja, i proponuje aktualizację. Nowa wersja jest sprawdzana przed użyciem, działa po ponownym uruchomieniu i można wrócić do wbudowanej.
- **Historia zadań:** panel Zadania ma dwie zakładki: „Teraz” z zadaniami z tej sesji i „Historia” z zakończonymi zadaniami, także z poprzednich uruchomień. Historia jest pogrupowana na Dziś, Wczoraj i starsze daty i ma przycisk „Pokaż w folderze” dla ich plików. „Wyczyść historię” opróżnia listę; pliki zostają na dysku.
- **Pobieranie ze schowka:** „Pobierz link ze schowka” w menu ikony w zasobniku otwiera skopiowany link YouTube, TikTok, X lub Instagram w odpowiednim narzędziu pobierania i od razu go sprawdza. Ustawienia → Zaawansowane → „Proponowanie skopiowanych linków” proponuje też nowo skopiowany link po powrocie do okna (domyślnie wyłączone).
- **Upuszczanie w dowolnym miejscu:** pliki upuszczone poza polem upuszczania otwierają okno „Otwórz w narzędziu” z narzędziami, które je przyjmują.
- Kilka skopiowanych linków do filmów trafia od razu do zakładki „Kolejka” w Pobieraniu wideo, z menu zasobnika albo z propozycji skopiowanego linku; linki, które już są w kolejce, są pomijane.
- **Zadania:** wyszukiwanie oraz filtr narzędzia i stanu na górze zakładki „Historia”, gdy ma kilka wpisów; wyszukiwanie znajduje tytuły i nazwy plików.
- **Zadania:** „Otwórz plik” obok „Pokaż w folderze” przy zakończonym zadaniu, które zapisało jeden plik, oraz „Ponów” przy nieudanym zadaniu, które uruchamia je jeszcze raz z tymi samymi ustawieniami.

### Zmieniono

- **Pobieranie wideo:** filmy z X i inne filmy przesyłane strumieniowo pobierają się kilka razy szybciej; aplikacja pobiera 8 kawałków filmu naraz zamiast po kolei.
- Powiadomienia na pulpicie to natywne powiadomienia Windows, pokazywane tylko wtedy, gdy okno nie jest na wierzchu; szybkie pobieranie metadanych już ich nie wysyła.
- **Zadania:** mniejsze karty. Zamiast wiersza przycisków są ikony „Otwórz plik” i „Pokaż w folderze” oraz menu „⋯” z „Prześlij do”, „Kopiuj ścieżkę” i „Przejdź do narzędzia”. Zakończone zadanie pokazuje, co powstało, np. „1080p · MP4 · 9:56 · 48 MB” albo „1,2 MB → 312 KB (−74%)”, także w „Historii”. Trwające zadanie pokazuje bieżący etap i ile już pobrano.
- **Pobieranie wideo:** karta zadania ma miniaturkę filmu, a podczas pobierania widać osobno obraz i dźwięk („Pobieranie obrazu (1/2)”). Pobieranie z Instagrama pokazuje prędkość i pobrany rozmiar.

### Naprawiono

- **Pobieranie wideo:** strony wymagające podszywania się pod przeglądarkę (TikTok) znowu działają w zainstalowanej aplikacji; wersja 0.12.0 zawierała curl_cffi w wersji nieobsługiwanej przez yt-dlp, co po cichu wyłączało podszywanie.
- **Pobieranie wideo:** ponowne pobranie anulowanego filmu z X w tej samej sesji nie kończy się już błędem „Unable to rename file”; pobieranie wznawia się od miejsca przerwania.
- **Zadania:** zadanie nazwane linkiem pokazuje cały adres (ginęła część `https:`), a zakończone pobieranie pojedynczego filmu ma przycisk „Prześlij do…”.
- **Pobieranie wideo:** pasek postępu nie cofa się już do zera po pobraniu obrazu, gdy zaczyna się pobieranie dźwięku.
- **Zadania:** treść błędu zachowuje nazwę strony na początku (z „[twitter]” znikało „[t”), a wpis „Synchronizacja wideo” w historii ma swój plik i przycisk „Pokaż w folderze”.
- Sprawdzanie linku (wideo lub Instagrama) i aktualizacja silnika pobierania nie odtwarzają już dźwięku zakończenia ani nie pokazują dymka czy powiadomienia na pulpicie, nie pojawiają się też jako karty w panelu Zadania ani na stronie startowej; wynik i tak widać na stronie albo w komunikacie o aktualizacji.

---

## [0.12.0] - 2026-11-05

### Dodano

- **Pobieranie z Instagrama:** „Zatrzymaj” podczas wczytywania profilu zachowuje dotąd znalezione posty, więc długiego profilu nie trzeba już wczytywać w całości przed zapisem.

### Zmieniono

- **Pobieranie z Instagrama:** relacje, wyróżnione relacje i profile wczytują się przez gallery-dl, który nadąża za aktualnymi kanałami GraphQL Instagrama; profil pokazuje posty partiami w trakcie wczytywania.
- **Ustawienia → Pliki cookies:** podpowiedź wskazuje folder, z którego zainstalowana aplikacja czyta pliki cookies, gdy ścieżka jest pusta (`%APPDATA%\MediaStudio\cookies`).

### Naprawiono

- **Pobieranie z Instagrama:** relacje, wyróżnione relacje i całe profile znów się pobierają (Instagram wyłączył kanały, z których korzystało narzędzie).
- **Pobieranie wideo:** post z X, który nie pobiera się z powodu braku pliku cookies X, pokazuje o tym komunikat ze wskazaniem Ustawień → Pliki cookies zamiast „No video could be found in this tweet”. Nieudane pozycje kolejki pokazują przetłumaczone błędy.

---

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

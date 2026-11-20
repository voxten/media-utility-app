# Lista zmian

Polskie tłumaczenie [CHANGELOG.md](CHANGELOG.md), pokazywane w aplikacji przy polskim języku. Każde wydanie trzeba dopisać w obu plikach.

## [Unreleased]

### Dodano

- **Pobieranie wideo** i **Instagram** mają przycisk „Wyczyść”, który czyści link, podgląd i ostatni wynik; folder i opcje zostają.
- Historia zadań pamięta linki, z których pobierano: kolejka pokazuje każdy link z tytułem i wynikiem, menu „⋯” kopiuje link lub linki, a wyszukiwarka historii znajduje też linki.
- **Łączenie PDF** i **PDF ↔ Obrazy** (obrazy do PDF) mają pole nazwy pliku obok folderu zapisu, zamiast zawsze zapisywać `polaczony.pdf` i `z_obrazow.pdf`.
- „Wyślij do” i upuszczenie pliku w dowolnym miejscu proponują **Transkrypcję** dla plików audio, a **Edytor GIF** dla animacji APNG.
- Zakładka „Pobierz w Media Studio” do przeglądarki (Ustawienia → Przeglądarka): jedno kliknięcie otwiera bieżącą stronę w **Pobieraniu wideo**, a linki z Instagrama w **Instagramie**, także gdy aplikacja jest zamknięta albo schowana w zasobniku. Linki z YouTube, TikToka, X i Instagrama są od razu sprawdzane, z innych stron tylko trafiają do pola; pobieranie i tak czeka na Twoje kliknięcie. Instalator ma do tego nową opcję, domyślnie zaznaczoną.
- Opcjonalny skrót klawiszowy w całym Windows (Ustawienia → Przeglądarka, domyślnie wyłączony) otwiera skopiowany link w aplikacji. Skrót zajęty przez inny program zostaje odrzucony z komunikatem.

### Zmieniono

- Kolejka pobierania w panelu zadań nazywa się „3 linki” zamiast „3 URL”.
- Ustawienia → Zależności pokazują pełny rozmiar pobierania narzędzia AI, razem z PyTorchem, jeśli trzeba go jeszcze zainstalować.
- Angielskie etykiety Ustawień piszą wielką literą tylko pierwsze słowo, jak reszta aplikacji.

### Naprawiono

- Ustawienia → Zależności zauważają dodatek, któremu zginęły pliki, np. po przerwanej instalacji, i proponują ponowną instalację zamiast pokazywać go jako gotowy.
- Instalacja dodatku przerwana zamknięciem aplikacji kończy się przy następnym uruchomieniu, a podmieniany pakiet nigdy nie zostaje skopiowany do połowy.
- Przenoszenie danych aplikacji do %LOCALAPPDATA% na innym dysku nie zostawia już niepełnych plików, gdy aplikacja zostanie zamknięta w trakcie.
- Otwarcie Ustawień przy uszkodzonym PyTorchu nie blokuje już wczytania ponownie zainstalowanego aż do restartu.
- Wznowiona kolejka pobierania zachowuje włączony SponsorBlock.
- Na listach takich jak Ustawienia → Pliki → Ciasteczka z przeglądarki znowu da się wybrać „Wyłączone”.
- Zadania z kilkoma plikami w Kompresorze obrazów, Narzędziach obrazu, Konwerterze wideo i audio oraz Edytorze GIF mają nazwę po polsku, np. „3 pliki” zamiast „3 files”.
- **Synchronizacja audio-wideo** eksportuje MP4 z napisami do MKV zamiast kończyć się błędem i nie nadpisuje już istniejącego pliku o tej samej nazwie.
- **Konwerter wideo i audio** pokazuje, dlaczego nie udało się przekonwertować pojedynczego pliku, zamiast samego „Nie udało się przekonwertować pliku”.
- Opis Narzędzi obrazu nie wspomina już o folderach, których to narzędzie nie przyjmuje.

## [0.15.0] - 2026-11-14

### Dodano

- **Pobieranie wideo** może pobrać tylko fragment filmu: wpisz zakres czasu albo wybierz rozdział.
- **Pobieranie wideo** może wyciąć z filmów YouTube fragmenty sponsorowane, autopromocję i prośby o subskrypcję dzięki SponsorBlock, także w kolejkach.
- Ustawienia → Pliki: ciasteczka mogą pochodzić prosto z Firefoksa, Chrome, Edge, Brave, Opery lub Vivaldi, gdy strona nie ma pliku cookies; działa w Pobieraniu wideo i Instagramie.
- Przy pierwszym uruchomieniu aplikacja wybiera język Windows: polski w polskim systemie, angielski w pozostałych (wcześniej zawsze startowała po polsku).
- Narzędzia wideo (Konwerter wideo i audio, Pobieranie wideo, Synchronizacja audio-wideo, Wideo do GIF, Transkrypcja) proponują instalację FFmpeg od razu na stronie, gdy go brakuje, zamiast zgłaszać błąd dopiero po uruchomieniu zadania.
- **Integracja z Windows**: instalator może dodać „Otwórz w Media Studio” do menu prawego przycisku dla obrazów, filmów, plików audio i PDF, pokazać aplikację w „Otwórz za pomocą” i dodać ją do „Wyślij do”. Pliki otwierają się w oknie „Otwórz w narzędziu” działającej aplikacji; kilka plików zaznaczonych razem trafia tam jako jeden zestaw.
- Przycisk aplikacji na pasku zadań pokazuje postęp trwających zadań.
- **Konwerter wideo i audio**: zmiana formatu filmów (MP4, MKV, MOV, WebM) i dźwięku (MP3, M4A, OGG, Opus, WAV, FLAC), wybór jakości albo docelowego rozmiaru pliku, np. 25 MB, przycinanie na osi czasu, zmniejszanie rozdzielczości, usuwanie dźwięku, wyciąganie samego dźwięku i wyrównywanie głośności. Można konwertować kilka plików naraz; filmy i pliki audio da się do niego wysłać z innych narzędzi.
### Zmieniono

- Odinstalowanie pyta, czy usunąć też ustawienia, historię, ciasteczka, modele AI, dodatki i FFmpeg; pliki zapisane w folderach wyników nigdy nie są usuwane.
- MediaStudio.exe pokazuje wersję i nazwę we Właściwościach → Szczegóły.
- PyTorch, rembg i ONNX Runtime instalują się w sprawdzonych, przypiętych wersjach, więc ich nowe wydanie nie zepsuje instalacji.
- THIRD_PARTY_NOTICES.md wymienia dołączone i pobierane komponenty z ich licencjami; instalator kopiuje go obok aplikacji. README opisuje instalację, ostrzeżenie SmartScreen i aktualne narzędzia.
- **Generator postępu** zapisuje kartę w folderze z pola „Folder zapisu” z nazwą pliku, którą można zmienić, zamiast za każdym razem pytać, gdzie zapisać.
- Pasek na dole każdego narzędzia w spoczynku podpowiada następny krok (wybierz plik, pliki gotowe), a zadanie pokazuje tylko w trakcie. Zakończone i nieudane zadania są zgłaszane raz, w dymku i na karcie zadania, zamiast zostawać w pasku.
- Konwerter, Pobieranie wideo, Instagram, Tekst na mowę i Synchronizacja audio-wideo mają to samo pole folderu zapisu co reszta narzędzi. Synchronizacja zapisuje w folderze zapisu zamiast obok filmu źródłowego i ma pole nazwy pliku.
- Upuszczenie lub wybranie plików, których narzędzie nie otworzy, pokazuje, ile pominięto, zamiast pomijać je bez słowa.
- Klawiatura i czytnik ekranu: okno zadań przejmuje fokus po otwarciu i oddaje go po zamknięciu, paleta poleceń ogłasza zaznaczone narzędzie, do paska miniatur da się dojść Tabem i przechodzić strzałkami (Delete usuwa plik), a przyciski widoku przed/po mówią, który jest włączony.
- Tempo mowy i nazwy modeli w Powiększaniu obrazu są tłumaczone.
- Media Studio jest udostępniane na licencji GNU Affero General Public License v3.0 lub nowszej (LICENSE); instalator kopiuje licencję obok aplikacji.
- **Usuwanie tła** działa jak Powiększanie obrazu: przycisk jest nieaktywny, dopóki model AI nie jest zainstalowany, a przy wyniku jest przycisk „Zmień opcje”; tło podglądu nadal można przełączać przy wyniku.
- **Edytor GIF** i **Konwerter wideo i audio** mają pola początku i końca w sekundach przy osi przycinania, tak jak Wideo do GIF.
- **Konwerter PDF**: obrazy do PDF można przeciągać w kolejności stron.
- **Konwerter obrazów**: zakładki „Plik” i „Pliki” to jedna lista; przy jednym pliku pokazuje jego format i rozmiar.
- **Wyszukiwarka duplikatów** czyści stare wyniki po wybraniu innego folderu, oznacza grupy, w których zaznaczono wszystkie kopie, ostrzega przed nimi przed usunięciem i przenosi pliki do Kosza jako zadanie z postępem, które można anulować.
- **Łączenie PDF** obraca stronę w lewo i w prawo oraz wszystkie strony naraz; przyciski strony pokazują się też, gdy strona ma fokus klawiatury.
- **Pobieranie wideo** pokazuje prędkość i pozostały czas raz, w pasku na dole, także w kolejce.

### Usunięto

- „Ostatnie foldery” w Ustawieniach → Przechowywanie. Lista wypełniała się tylko skanami Duplikatów i nic z niej nie korzystało.

### Naprawiono

- Narzędzie pokazuje wynik zadania, które skończyło się, gdy otwarta była inna strona, także po kliknięciu dymka „zakończono”: Wyszukiwarka duplikatów, Skalowanie obrazów AI, Usuwanie tła AI, Usuwanie znaku wodnego, Tekst na mowę, Instagram, sprawdzanie linku w Pobieraniu wideo i wczytywanie plików w Łączeniu PDF.
- „Prześlij do” narzędzia, które jest już otwarte, od razu wczytuje pliki, zamiast przy następnym wejściu.
- Usuwanie znaku wodnego pamięta namalowaną maskę po przejściu na inną stronę i po powrocie z wyniku, a cofanie zużywa dużo mniej pamięci przy dużych zdjęciach.
- Dwie kolejki pobierania działające naraz nie nadpisują już sobie zapisanych linków.
- Instagram pobiera dokładnie zaznaczone posty, nawet gdy konto dodało coś nowego po sprawdzeniu; ponowne sprawdzanie profilu kończy się, gdy tylko znajdzie wszystkie zaznaczone posty.
- Anulowany zapis GIF, WebP lub MP4 nie zostawia już w folderze pliku, który wygląda na gotowy.
- Ostatnie nagranie z Tekstu na mowę i podgląd w Synchronizacji Audio-Wideo nie odtwarzają się już same przy każdym wejściu na stronę.
- Tekst na mowę i Generator postępu nie zastępują już wcześniejszego pliku o tej samej nazwie, tylko dodają „(1)”, „(2)”.
- „Otwórz plik”, „Pokaż w folderze” i „Przenieś do kosza” mówią, dlaczego się nie udało (pliku już nie ma albo Windows odmówił), zamiast nic nie robić. Wyszukiwarka duplikatów nie usuwa już z listy plików, których nie udało się przenieść do kosza.
- Wynik ostatniej kolejki w Pobieraniu wideo zostaje na stronie, nawet gdy kolejka skończyła się, kiedy otwarte było inne narzędzie.
- Karta zadania pisze, że brakuje pliku, tylko przy zakończonych zadaniach.
- „Zastosuj do wszystkich” w Narzędziach obrazu działa też dla plików, których nie otwierałeś, a kadr i zmiana rozmiaru zachowują proporcje każdego zdjęcia, więc pionowe zdjęcia nie są już rozciągane do poziomego rozmiaru.
- Usuwanie tła AI, Skalowanie obrazów AI i Usuwanie znaku wodnego obracają zdjęcia z telefonu zgodnie z EXIF i czytają 16-bitowe pliki PNG i TIFF.
- Przekonwertowane, skompresowane i edytowane zdjęcia zachowują profil kolorów, więc zdjęcia z iPhone'a nie wychodzą już wyblakłe.
- Zdjęcia z części aparatów Samsung, Sony i Fuji zapisują się jako .jpg zamiast .mpo.
- Kompresor obrazów i Kompresor PDF zostawiają oryginał, gdy wynik nie byłby mniejszy, i oznaczają go „Bez zysku”. „Docelowy rozmiar” dla PNG nie powtarza już 14 razy tej samej wolnej próby i mówi, gdy nie udało się zejść do zadanego rozmiaru.
- Kompresor PDF naprawdę zmniejsza duże obrazy; wcześniej każde ustawienie zawodziło na tym kroku i plik był tylko przepakowywany.
- Przebieg dźwięku w Synchronizacji Audio-Wideo nie rozjeżdża się już przy powiększeniu. Eksport z opóźnionym dźwiękiem zachowuje długość filmu, jego napisy i rozdziały.
- Linki ze stron takich jak dropbox.com czy netflix.com nie są już traktowane jak linki z X (Twittera).
- Bardzo długie tytuły filmów są skracane, żeby plik zmieścił się w limicie długości ścieżki w Windows.
- Skalowanie obrazów AI modelem anime pracuje na kafelkach i zużywa dużo mniej pamięci; gdy pamięci nadal brakuje, próbuje ponownie z mniejszymi kafelkami.
- Ustawienia nie pokazują już FFmpeg jako gotowego, gdy brakuje ffprobe, a instalacja FFmpeg uzupełnia brakujący ffprobe.
- Komunikaty o błędach są w Twoim języku i mówią, co poszło nie tak (brak pliku, plik zajęty przez inny program, pełny dysk, PDF chroniony hasłem albo uszkodzony), zamiast pokazywać klucz tłumaczenia albo angielski tekst z kodami kolorów terminala. Szczegóły techniczne zostają w logu.
- Szybkie operacje, takie jak sprawdzenie linku czy wczytanie PDF, odpowiadają od razu, nawet gdy w kolejce czeka dużo zadań.
- Kompresor obrazów, Narzędzia obrazu i siatka stron PDF pokazują błąd zamiast kręcić się bez końca, gdy pliku nie da się odczytać; jeden uszkodzony plik nie blokuje już pozostałych.
- Nieudana instalacja modelu nie powtarza już dymka z błędem, a wyjście i powrót w trakcie instalacji nie zaczyna drugi raz tego samego pobierania.
- „Anuluj” zatrzymuje teraz sprawdzanie długiej listy linków, zamianę na MP3 po pobraniu, Tekst na mowę i instalację dodatków AI. Anulowana instalacja dodatku zostawia wersję, która działała wcześniej.
- Tekst na mowę nie pokazuje już na chwilę okna konsoli przy zapisie WAV, OGG i FLAC.
- Usuwanie tła AI pobiera model przy instalacji, z paskiem postępu i sumą kontrolną, zamiast stać na 15% przy pierwszym użyciu. Pozostałe modele pobierają się tak samo, gdy wybierzesz je pierwszy raz.
- Pobieranie modelu w Skalowaniu obrazów AI nie twierdzi już, że pobiera model LaMa.
- Po „Zakończ” aplikacja zamyka się w kilka sekund, więc „Uruchom ponownie” nie uruchamia już drugiej kopii obok pierwszej.

### Wydajność

- Duże zdjęcia, GIF-y, nagrania i podglądy wideo trafiają do okna jako pliki, a nie jako dziesiątki megabajtów tekstu, więc Usuwanie tła, Usuwanie znaku wodnego, narzędzia GIF, Kompresor obrazów, Tekst na mowę i Synchronizacja audio-wideo zużywają dużo mniej pamięci i szybciej pokazują wynik.
- Edytor GIF trzyma otwartą animację w pamięci, więc kolejny podgląd nie dekoduje od nowa wszystkich klatek; podgląd, który skończy się po zmianie ustawień, nie zastępuje już nowszego.
- Wyszukiwarka duplikatów porównuje 10 000 zdjęć w kilka sekund zamiast godzin, daje się anulować w trakcie porównywania i robi podglądy tylko dla znalezionych plików.
- Listy plików wczytują podglądy tylko widocznych plików, po kilka naraz, i trzymają w pamięci ograniczoną ich liczbę. Miniatury stron PDF są wysyłane raz, a nie dwa razy.
- Okno otwiera się szybciej: narzędzia ładują swoje biblioteki przy pierwszym użyciu, a pamięć podręczna WebView jest czyszczona tylko po aktualizacji.
- Dodatki AI, FFmpeg, aktualizacje silników pobierania i pamięć podręczna przeniosły się z profilu Roaming (%APPDATA%) do %LOCALAPPDATA%, więc profil wędrujący nie kopiuje już gigabajtów przy logowaniu. Pliki pamięci podręcznej starsze niż tydzień są usuwane przy starcie.
- Usuwanie tła trzyma w pamięci jeden model zamiast każdego użytego. Usuwanie znaku wodnego z LaMa przetwarza zamalowany obszar z otoczeniem zamiast całego zdjęcia.

## [0.14.0] - 2026-11-11

### Dodano

- **Pobieranie wideo: format kolejki.** Kolejka i playlisty pobierają film do wybranej maksymalnej jakości albo sam dźwięk w wybranym formacie (MP3, M4A, FLAC i inne), zamiast zawsze najlepszego filmu.
- **Pobieranie wideo: archiwum pobranych.** Każde zakończone pobieranie jest zapamiętywane, a „Pomijaj pobrane wcześniej” pozwala kolejce pominąć linki, które już masz. Ustawienia → Pamięć i pamięć podręczna → „Archiwum pobranych” pokazuje, ile filmów pamięta, i pozwala je wyczyścić.
- **Pobieranie wideo:** „Okładka i metadane w pliku” zapisuje miniaturkę i dane, np. tytuł, w pobranym pliku wideo lub audio.
- **Pobieranie wideo:** pozycje playlisty można zaznaczać pojedynczo albo całym zakresem przez Shift+klik.
- **Pobieranie wideo: wznawianie kolejki.** Linki, które nie zdążyły się pobrać przed zamknięciem aplikacji albo anulowaniem kolejki, zostają zapamiętane, a narzędzie przy następnym razie proponuje „Wznów” albo „Odrzuć”. Nowa kolejka pyta, zanim je zastąpi. Wynik ostatniej kolejki zostaje na stronie po przejściu do innego narzędzia.
- **Ekran błędu:** gdy strona się zepsuje, pokazuje „Spróbuj ponownie” i „Przejdź do Startu” zamiast pustego miejsca; błąd całego okna proponuje „Odśwież okno”. Jeśli aplikacja nie może wystartować albo nie odpowiada przez 30 sekund, mówi o tym zamiast kręcić się bez końca.
- **Logi:** błędy i przebieg pracy aplikacji zapisują się w pliku, przydatnym przy zgłaszaniu problemu. Ustawienia → Pamięć i pamięć podręczna → „Logi” otwiera folder.
- Pole **„Folder zapisu”**, wypełnione domyślnym folderem z Ustawień, w Kompresorze obrazów, narzędziach GIF, Narzędziach obrazu, narzędziach PDF, Transkrypcji i przy zapisie wyników AI.
- **Skróty w każdym narzędziu:** Ctrl+Enter uruchamia, Esc anuluje, a Ctrl+O dodaje pliki.
- **Wyszukiwarka duplikatów** przyjmuje upuszczony folder; **Tekst na mowę** otwiera upuszczony albo wybrany plik .txt.
- Ustawienia → Pamięć i pamięć podręczna pokazują rozmiar modeli AI z przyciskiem „Otwórz folder”.

### Zmieniono

- **„Zadania naraz”** w Ustawieniach naprawdę ogranicza, ile zadań działa jednocześnie, i działa od razu po zmianie. Sprawdzanie linków, odczyt PDF i aktualizacja silnika pobierania nigdy nie czekają w kolejce.
- Narzędzia pamiętają pliki i ustawienia po przejściu na inną stronę i z powrotem: Kompresor obrazów, narzędzia GIF, Narzędzia obrazu, narzędzia PDF, Synchronizacja Audio-Wideo i Transkrypcja.
- Zakończone zadanie pokazuje wynik na stronie narzędzia; dymek pojawia się tylko wtedy, gdy jesteś na innej stronie.
- Zapis nigdy nie nadpisuje istniejącego pliku: Konwerter obrazów, Kompresor obrazów, Narzędzia obrazu, Podział PDF, PDF ↔ Obrazy i każdy wynik zapisywany jako jeden plik dodają do nazwy „(1)”, „(2)”.
- Komunikaty o błędach są krótsze i przetłumaczone, bez technicznych przedrostków w rodzaju „ValueError:”.
- Modele AI są trzymane w `%LOCALAPPDATA%\MediaStudio\models`, więc nie wędrują już z profilem Windows; modele pobrane wcześniej zostają tam przeniesione raz przy starcie.
- **Bezpieczniejsze dodatki:** pobrane FFmpeg, gifsicle, LaMa, Real-ESRGAN i Whisper są sprawdzane ze znaną sumą kontrolną przed użyciem, a FFmpeg pochodzi z ustalonego wydania. Aktualizacje silnika pobierania są sprawdzane z sumami kontrolnymi opublikowanymi w PyPI.
- Otwieranie pliku z aplikacji nigdy nie uruchamia programu: pliki `.exe`, `.bat`, skróty i podobne są zamiast tego pokazywane w Eksploratorze.
- Ustawienia → Zaawansowane → niestandardowa ścieżka do FFmpeg musi wskazywać `ffmpeg.exe` albo jego folder; w innym razie pojawia się błąd.
- Z Ustawień zniknął przełącznik „Akceleracja GPU”; nic nie zmieniał.
- Zainstalowana aplikacja jest mniejsza o około 9 MB (nie zawiera już nieużywanej biblioteki okienek).
- Panel Zadania działa szybko także przy długiej historii: trwające zadanie odświeża tylko swoją kartę, a aplikacja trzyma w pamięci 100 ostatnich zakończonych zadań.

### Naprawiono

- **Narzędzia obrazu:** przetwarzanie wielu plików można anulować, a Ctrl+C / Ctrl+V podczas pisania w polu nie przełączają już narzędzi.
- Zdjęcia obrócone przez aparat wychodzą we właściwej orientacji, przezroczyste obrazy zapisane jako JPEG, BMP lub PDF dostają białe tło zamiast czarnego, a pliki TIFF działają z formatem „Taki sam jak oryginał”.
- FFmpeg nie może już nadpisać pliku, z którego czyta, i jest zatrzymywany, gdy się wysypie albo zawiesi.
- **Narzędzia PDF:** zapis skompresowanego lub obróconego PDF w miejsce oryginału działa; Podział PDF nazywa pliki według stron; wyciągnięty tekst i nazwy plików nie są już tylko po polsku.
- **Pobieranie wideo:** linki dodane, gdy kolejka się kończy, zaczynają nową kolejkę zamiast przepadać, a link bez niczego do pobrania daje jasny komunikat.
- **Wyszukiwarka duplikatów:** wyeksportowany plik CSV pokazuje polskie litery poprawnie w Excelu.
- Podgląd strony PDF, którego nie da się wczytać, pokazuje komunikat zamiast pustego miejsca.

---

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

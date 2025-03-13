// imports
const jsmediatags = window.jsmediatags

// global variables
let currentLyrics = [] // (final JSON) -> array of lyrics
let tempLyrics = [];
let currentWordIndex = 0; // index of the currently recorded word
let lastWordIndex = 0;
let goBackIndex = 0; // index of the word to go back to (arrow keys)
let importedJSON = false; // if the lyrics have been imported from a JSON file
let filename = ''; // name of the file
let selectedWordIndex = -1; // index of the selected word
let played_word = ''; // word that is currently being played
let music_file = null; // music file
let isVisible = true;
const AppVersion = {
    version: '1.0.0-rev1',
    customName: 'Ibratabian17\'s Fork'
}

// dom elements
const elem_part_sortable = document.getElementsByClassName('part-sortable');
const elem_musicInput = document.getElementById('music-input');
const elem_musicPlayer = document.getElementById('music-player');
const elem_lyricsInput = document.getElementById('lyrics-input');
const elem_lyricsContent = document.getElementById('lyrics-content');
const elem_navbar = document.getElementById('navbar');
const elem_showMenu = document.querySelector('.show-more');

// plyr
const player = new Plyr(elem_musicPlayer, {
    controls: ['play', 'progress', 'current-time', 'mute', 'settings'],
    speed: {
        selected: 1,
        options: [0.5, 0.75, 1, 1.5]
    }
});

elem_showMenu.onclick = function () {
    if (isVisible) {
        elem_navbar.setAttribute('visible', 'false')
        isVisible = false
    } else {
        elem_navbar.setAttribute('visible', 'true')
        isVisible = true
    }
}

// sortable
for (let i = 0; i < elem_part_sortable.length; i++) {
    var sortable = Sortable.create(elem_part_sortable[i], {
        group: "part-sortable",
        handle: ".inner-part-title",
        animation: 150,
        filter: ".ignore-elements",
        ghostClass: "inner-part-ghost",
        chosenClass: "inner-part-chosen",
        dragClass: "inner-part-drag",
        store: {
            set: function (sortable) {
                var order = sortable.toArray();
                localStorage.setItem(sortable.options.group.name, order.join('|'));
            },
            get: function (sortable) {
                var order = localStorage.getItem(sortable.options.group.name);
                return order ? order.split('|') : [];
            }
        }
    });
}

// tools
function msToTime(duration) {
    let milliseconds = parseInt((duration % 1000) / 10);
    let seconds = parseInt((duration / 1000) % 60);
    let minutes = parseInt((duration / (1000 * 60)) % 60);

    milliseconds = (milliseconds < 10) ? '0' + milliseconds : milliseconds;
    seconds = (seconds < 10) ? '0' + seconds : seconds;
    minutes = (minutes < 10) ? '0' + minutes : minutes;

    return minutes + ':' + seconds + '.' + milliseconds;
}

// functionnal functions
function reset() {
    // reset global variables
    currentLyrics = [];
    currentWordIndex = 0;
    goBackIndex = 0;
    importedJSON = false;
    filename = '';
    selectedWordIndex = -1;
    played_word = '';

    // reset dom elements
    elem_musicPlayer.src = '';
    elem_musicInput.value = '';
    elem_lyricsInput.value = '';
    elem_lyricsContent.innerHTML = '';

    // reset music info
    document.getElementById('music-title').innerText = '';
    document.getElementById('music-artist').innerText = '';
    document.getElementById('music-album').innerText = '';
    document.getElementById('music-album-art').src = null;
}

function importSong() {
    elem_musicInput.type = 'file';
    elem_musicInput.accept = '.mp3, .wav, .ogg, .flac, .m4a, .mp4, .opus, .mkv, .webm, .m3u8';
    elem_musicInput.click();
    elem_navbar.setAttribute('visible', 'false')
    isVisible = false
}

function importJSON(files) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    if (!files) {
        input.click();
    }

    importedJSON = true;

    input.addEventListener('change', function () {
        const file = this.files[0];
        const reader = new FileReader();
        reader.readAsText(file, 'UTF-8');
        reader.onload = function (evt) {
            const json = parseJsonToLyrics(JSON.parse(evt.target.result));
            const lyricsData = Array.isArray(json) ? json : json.lyrics || [];

            // Clear the current lyrics content
            elem_lyricsContent.innerHTML = '';

            let currentLine = null; // Store the current line as an array
            let isNewLine = true; // Flag to check if we need to start a new line

            // Iterate through the provided lyrics array
            lyricsData.forEach((lyric, index) => {
                if (isNewLine) {
                    currentLine = document.createElement('p');
                    currentLine.classList.add('lyrics-line');
                    // Add class for even or odd lines
                    currentLine.classList.add(lyric.lineIndex % 2 === 0 ? 'even' : 'odd');
                    if (lyric.isTaggedLine) {
                        currentLine.classList.add('tagged-line');
                    }
                    isNewLine = false; // We are adding words to a new line
                }

                const span = document.createElement('span');
                span.classList.add('lyrics-word');
                span.innerText = lyric.text;
                span.id = 'word-' + index;
                if (isRTL(lyric.text)) span.classList.add('rtl-word')
                if (lyric.isDone) {
                    span.classList.add('done-word')
                    span.style.setProperty('--duration', lyric.duration + 'ms');
                }
                span.style.setProperty('--duration', lyric.duration + 'ms');
                lyricsData[index].element = span
                currentLine.appendChild(span);

                // If it's the end of the line, append the currentLine and reset the flag
                if (lyric.isLineEnding) {
                    elem_lyricsContent.appendChild(currentLine);
                    isNewLine = true; // Prepare for the next line
                }
            });

            tempLyrics = lyricsData;
            currentWordIndex = tempLyrics.length - 1;
        };
    });

    if (files) {
        input.files = files;
        input.dispatchEvent(new Event('change'));
    }
}


function parseJsonToLyrics(jsonData) {
    const newLyrics = [];
    let previousSongPart = null; // Track previous songPart to avoid repeating it
    let offset = 0;
    let lineIndex = 0; // Starting line index, incremented per line

    jsonData.forEach((item, idx) => {
        const words = item.text;
        const element = item.element || {}; // Safeguard for item.element being undefined
        const songPart = element.songPart || null; // Safeguard for element.songPart being undefined

        // If the songPart changes, add a tagline
        if (songPart && songPart !== previousSongPart) {
            // Add a tagged line for the songPart if it's different from the previous one
            const tagFormat = {
                time: 0,
                duration: 0,
                text: "#" + songPart,
                isLineEnding: true,
                isTaggedLine: true,
                tag: songPart,
                tempElement: {
                    key: `L${lineIndex}`,
                    songPart: songPart,
                    singer: element.singer || null // Safeguard for element.singer
                },
                element: {},
                offset: offset,
                lineIndex: lineIndex,
                wordIndex: offset
            };
            newLyrics.push(tagFormat); // Add the tag to the new lyrics
            previousSongPart = songPart; // Update previous songPart to current one
        }

        const wordData = {
            time: item.time, // Keep the time from the original JSON
            duration: item.duration, // Duration remains the same
            text: words,
            isLineEnding: item.isLineEnding == 1, // Last word in line is a line-ending
            isTaggedLine: false, // It's not a tagged line unless it's set otherwise
            tag: null, // No tag unless it's a tagged line
            tempElement: {
                key: `L${lineIndex}`,
                songPart: songPart,
                singer: element.singer || null // Safeguard for element.singer
            },
            element: {}, // Empty object as we're not using the DOM
            offset: offset,
            lineIndex: lineIndex,
            wordIndex: offset,
            isDone: true
        };

        newLyrics.push(wordData); // Add the word data to the new lyrics
        if (item.isLineEnding == 1) lineIndex++;
        offset++; // Increment offset after adding each word
    });
    // Add #ENDOFLINE tag
    if (jsonData.length > 0) {
        const lastItem = jsonData[jsonData.length - 1];
        const endOfLineTag = {
            time: lastItem.time + lastItem.duration, // Time of the last word + its duration
            duration: 0,
            text: "#ENDOFLINE",
            isLineEnding: true,
            isTaggedLine: true,
            tag: "ENDOFLINE",
            tempElement: {
                key: `L${lineIndex}`,
                songPart: null,
                singer: null
            },
            element: {},
            offset: offset,
            lineIndex: lineIndex,
            wordIndex: offset
        };
        newLyrics.push(endOfLineTag); // Add the end of line tag
    }

    return newLyrics; // Return the final array of lyrics
}


function parseLyrics() {
    if (elem_lyricsInput.value.trim() === '') {
        return;
    }

    elem_lyricsContent.innerHTML = '';

    const newLyrics = [];
    const lines = `${elem_lyricsInput.value}\n#ENDOFLINE`.split('\n');
    let offset = 0;
    let tempIndex = 0; // Indeks untuk melacak posisi dalam tempLyrics
    let currentTag = "";

    lines.forEach((line, lineIndex) => {
        const p = document.createElement('p');
        p.classList.add('lyrics-line');
        p.classList.add(lineIndex % 2 === 0 ? 'even' : 'odd');

        let isTaggedLine = false;

        // Cek apakah baris ini memiliki tag
        const firstWord = line.trim().split(' ')[0];
        if (firstWord.startsWith('#')) {
            isTaggedLine = true;
            currentTag = firstWord.substring(1); // Simpan tag tanpa #
            p.classList.add('tagged-line'); // Tambahkan class untuk baris
        }

        const words = line.split(' ');
        words.forEach((word, wordIndex) => {
            const span = document.createElement('span');
            const wordText = word;

            span.classList.add('lyrics-word');
            span.innerText = wordText + ' ';

            // Cari data sebelumnya di tempLyrics
            let existingData = tempLyrics.find(tempItem =>
                tempItem.text.trim() === wordText.trim() &&
                tempItem.lineIndex === lineIndex &&
                tempItem.wordIndex === wordIndex
            );

            if (!existingData) {
                existingData = {
                    time: 0, // Default time
                    duration: 0, // Default duration
                    text: (wordIndex === words.length - 1) ? wordText : wordText + ' ',
                    isLineEnding: wordIndex === words.length - 1,
                    isTaggedLine: isTaggedLine, // Tandai apakah ini bagian dari tagged line
                    tag: isTaggedLine ? currentTag : null, // Simpan tag jika ada
                    tempElement: { key: `L${lineIndex}`, songPart: currentTag, singer: 'v1' }, //need to change v1 help
                    element: null, // Akan di-update dengan DOM element
                    offset,
                    lineIndex, // Simpan indeks baris
                    wordIndex // Simpan indeks kata di dalam baris
                };
            } else {
                // Update jika sudah ada data
                existingData.isLineEnding = wordIndex === words.length - 1;
            }

            if (wordText.trim() == '') {
                span.classList.add('lyrics-space');
            }
            if (isRTL(wordText)) {
                span.classList.add('rtl-word');
            }

            if (existingData.isDone) {
                span.classList.add('done-word')
                span.style.setProperty('--duration', lyric.duration + 'ms');
            }

            existingData.element = span;
            span.id = 'word-' + offset;

            p.appendChild(span);
            newLyrics.push(existingData); // Tambahkan ke array sinkronisasi
            offset++;
        });

        elem_lyricsContent.appendChild(p);
    });

    // Perbarui tempLyrics tanpa menghapus data sebelumnya
    tempLyrics = newLyrics.map((item, index) => {
        const existingItem = tempLyrics.find(tempItem => tempItem.offset === index);
        return existingItem ? { ...existingItem, ...item } : item;
    });
}


function nextWord() {
    const NextWordButton = document.getElementById('nextword-button');
    NextWordButton.classList.add('enabled');
    setTimeout(() => {
        NextWordButton.classList.remove('enabled');
    }, 50);

    const time = elem_musicPlayer.currentTime * 1000;
    let currentWord = tempLyrics[currentWordIndex];
    let lastWord = tempLyrics[currentWordIndex - 1];
    lastWordIndex = currentWordIndex - 1

    // Skip words in tagged lines
    while (currentWord && currentWord.isTaggedLine && currentWord.text !== "#ENDOFLINE") {
        currentWordIndex++;
        currentWord = tempLyrics[currentWordIndex];
        lastWord = tempLyrics[currentWordIndex - 1];
    }

    if (lastWord && lastWord.isTaggedLine && lastWordIndex != -1) {
        lastWordIndex++;
        lastWord = tempLyrics[lastWordIndex];
    }

    if (!currentWord) {
        return; // Tidak ada kata selanjutnya
    }

    const pWordIndex = tempLyrics.findIndex(word => word.element.classList.contains('current-word'));
    if (pWordIndex !== -1) tempLyrics[pWordIndex].element?.classList?.remove('current-word')

    const playingWordIndex = tempLyrics.findIndex(word => word.element.classList.contains('playing-word'));

    /*if (playingWordIndex !== -1 && playingWordIndex < currentWordIndex - 1) {
        currentWordIndex = playingWordIndex;
        const playingWord = tempLyrics[currentWordIndex];
        playingWord.element.classList.add('current-word');
        playingWord.element.classList.remove('done-word');
        tempLyrics.forEach((word, index) => {
            if (index > currentWordIndex - 1) {
                word.element.classList.remove('done-word');
                word.element.classList.remove('current-word');
                word.time = 0;
                word.duration = 0;
            }
        });
    }*/

    currentWord.time = time;
    currentWord.isDone = true;
    currentWord.duration = 0;
    if (lastWord) {
        const lastWordTime = lastWord.time;
        const difference = time - lastWordTime;
        lastWord.duration = difference;
        lastWord.element.style.setProperty('--duration', difference + 'ms');
    }

    if (currentWord.element) {
        currentWord.element.classList.add('current-word');
        currentWord.element.id = 'word-' + currentWordIndex;
        currentWord.element.classList.add('playing-word');
    }

    if (lastWord && lastWord.element) {
        lastWord.element.classList.add('done-word');
        lastWord.element.classList.remove('current-word');
    }

    currentWordIndex++;

    const elem_lyricsContent = document.getElementById('lyrics-content');
    elem_lyricsContent.scrollTop = currentWord.element.offsetTop - elem_lyricsContent.offsetTop - 100;

    if (currentWordIndex >= tempLyrics.length) {
        setTimeout(() => {
            currentWord.element.classList.remove('current-word');
            currentWord.element.classList.add('done-word');
        }, 500);
    }
}

function openWord(wordIndex) {
    const word = tempLyrics[wordIndex];
    if (!word) return;

    currentWordIndex = wordIndex;
    selectedWordIndex = wordIndex;

    document.querySelectorAll('.opened-word').forEach(el => el.classList.remove('opened-word'));
    word.element?.classList.add('opened-word');

    document.getElementById('properties-word').innerText = word.text;
    document.getElementById('properties-start').value = word.time;
    document.getElementById('properties-length').value = word.duration;
    
    elem_musicPlayer.currentTime = word.time / 1000;
}
function unselect() {
    selectedWordIndex = -1;
    document.querySelectorAll('.opened-word').forEach(el => el.classList.remove('opened-word'));

    document.getElementById('properties-word').innerText = '';
    document.getElementById('properties-start').value = 0;
    document.getElementById('properties-length').value = 0;
}

function isRTL(s) {
    var ltrChars = 'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0300-\u0590\u0800-\u1FFF' + '\u2C00-\uFB1C\uFDFE-\uFE6F\uFEFD-\uFFFF',
        rtlChars = '\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC',
        rtlDirCheck = new RegExp('^[^' + ltrChars + ']*[' + rtlChars + ']');

    return rtlDirCheck.test(s);
};


// UI functions
function playPause() {
    const playPauseButton = document.getElementById('playpause-button');
    playPauseButton.classList.add('enabled');
    setTimeout(() => {
        playPauseButton.classList.remove('enabled');
    }, 50);

    if (elem_musicPlayer.paused) {
        elem_musicPlayer.play();
    } else {
        elem_musicPlayer.pause();
    }
}

function previewToggle() {
    document.getElementById('lyrics-content').classList.toggle('preview');

    if (document.querySelector('#preview-mode').innerHTML == 'Preview mode') {
        document.querySelector('.part-left').setAttribute('visible', 'false');
        document.querySelector('#preview-mode').innerHTML = 'Edit mode';
    }
    else {
        document.querySelector('.part-left').setAttribute('visible', 'true');
        document.querySelector('#preview-mode').innerHTML = 'Preview mode';
    }

    // preview-checkbox
    const previewCheckbox = document.getElementById('preview-checkbox');
    previewCheckbox.checked = document.getElementById('lyrics-content').classList.contains('preview');
}

document.getElementById('preview-theme').addEventListener('change', () => {
    // change data-theme of lyrics-content
    document.getElementById('lyrics-content').setAttribute('data-theme', document.getElementById('preview-theme').value);
});

// exports
function prepareJSON() {
    //Filter out empty words or items with isTaggedLine == true
    let exportedLyrics = tempLyrics.filter(word => word.text.trim() !== '')
        .filter(word => word.isTaggedLine !== true)
        .map(item => ({
            time: Math.round(item.time),
            duration: Math.round(item.duration),
            text: item.text,
            isLineEnding: item.isLineEnding ? 1 : 0,
            element: item.tempElement ? {
                key: item.tempElement.key,
                songPart: item.tempElement.songPart,
                singer: item.tempElement.singer
            } : {}
        }));

    // make pretty JSON
    const json = JSON.stringify(exportedLyrics, null, 4);

    const blob = new Blob([json], { type: 'application/json' });
    return blob;
}

function prepareLRC() {
    let lrcContent = '';

    let currentPhraseTime = '';
    let currentPhrase = '';

    tempLyrics.forEach((word, index) => {
        if (index === 0 || tempLyrics[index - 1].isLineEnding === 1) {
            if (currentPhrase !== '') {
                lrcContent += '[' + currentPhraseTime + ']' + currentPhrase.trim() + '\n';
            }
            currentPhraseTime = msToTime(word.time);
            currentPhrase = word.text;
        } else {
            currentPhrase += word.text;
        }
    });

    lrcContent += '[' + currentPhraseTime + ']' + currentPhrase.trim() + '\n';

    const formattedContent = lrcContent.trim();
    const blob = new Blob([formattedContent], { type: 'text/plain' });
    return blob;
}

function prepareELRC() {
    let lrcContent = '';

    tempLyrics.forEach((word, index) => {
        if (index === 0 || tempLyrics[index - 1].isLineEnding === 1) {
            lrcContent += '\n' + '[' + msToTime(word.time) + ']' + word.text;
        }
        else {
            lrcContent += ' <' + msToTime(word.time) + '>' + word.text;
        }
    });

    const formattedContent = lrcContent.trim();
    const blob = new Blob([formattedContent], { type: 'text/plain' });
    return blob;
}

function exportJSON() {
    const blob = prepareJSON();
    downloadBlob(blob);
}

function exportLRC() {
    const blob = prepareLRC();
    downloadBlob(blob, 'lrc');
}

function exportELRC() {
    const blob = prepareELRC();
    downloadBlob(blob, 'lrc');
}

function downloadBlob(blob, format = 'json') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = filename + '.' + format;
    a.click();
}

function exportKMAKE() {
    var zip = new JSZip();

    // add music
    zip.file("audiofile.kmakefile", music_file);

    // add lyrics
    let jsonLyrics = prepareJSON();
    zip.file("lyrics.kmakefile", jsonLyrics);

    const options = {
        type: 'blob',
        mimeType: 'application/kmake',
    };

    // export
    zip.generateAsync(options).then(function (content) {
        downloadBlob(content, 'kmake');
    });
}

function importKMAKE() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.kmake';
    input.onchange = e => {
        reset();

        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.readAsArrayBuffer(file);
            reader.onload = readerEvent => {
                const content = readerEvent.target.result;
                JSZip.loadAsync(content).then(function (zip) {
                    // get music
                    zip.file("audiofile.kmakefile").async("blob").then(function (content) {
                        const file = new File([content], 'audiofile.mp3');

                        // create filelist
                        const fileList = new DataTransfer();
                        fileList.items.add(file);

                        // set music
                        elem_musicInput.files = fileList.files;
                        elem_musicInput.dispatchEvent(new Event('change'));
                    });

                    // get lyrics
                    zip.file("lyrics.kmakefile").async("string").then(function (content) {
                        const file = new File([content], 'lyrics.json');

                        // create filelist
                        const fileList = new DataTransfer();
                        fileList.items.add(file);

                        // set lyrics
                        importJSON(fileList.files);
                    });
                });
            }
        }
    }
    input.click();
}

// shortcuts
document.addEventListener('keydown', function (event) {
    // check if we're in the lyrics input
    if (document.activeElement === elem_lyricsInput) {
        return;
    }
    if (event.keyCode === 13) {
        // prevent default
        event.preventDefault();

        nextWord();
    }
});

// playback
setInterval(() => {
    if (!tempLyrics || tempLyrics.length === 0) return;

    // Pause detection
    if (elem_musicPlayer.paused) {
        document.getElementById('lyrics-content').classList.add('paused');
    } else {
        document.getElementById('lyrics-content').classList.remove('paused');
    }

    const time = elem_musicPlayer.currentTime * 1000;

    // Find current word
    let currentWord = null;
    for (let i = 0; i < tempLyrics.length; i++) {
        const word = tempLyrics[i];
        if (word.time > time) {
            // Skip tagged lines when finding current word
            let previousWord = tempLyrics[i - 1];
            while (previousWord && previousWord.isTaggedLine) {
                i--;
                previousWord = tempLyrics[i - 1];
            }
            currentWord = previousWord || null;
            break;
        }
    }

    // Remove playing-word class from previous word
    const playingWordElement = document.querySelector('.playing-word');
    if (playingWordElement) {
        playingWordElement.classList.remove('playing-word');
    }

    // Add playing-word class to current word
    if (currentWord && currentWord.element) {
        currentWord.element.classList.add('playing-word');
    }

    // Check if word changed
    if (currentWord && currentWord.text === played_word) {
        return;
    } else if (!currentWord) {
        return;
    } else {
        played_word = currentWord.text;
    }

    // Add past-word class to previous words (excluding tagged lines)
    const allWords = Array.from(document.querySelectorAll('.lyrics-word')).filter(word => {
        const wordIndex = parseInt(word.id.split('-')[1]);
        return !tempLyrics[wordIndex]?.isTaggedLine;
    });
    const currentIndex = allWords.indexOf(currentWord.element);
    allWords.forEach((word, index) => {
        word.classList.toggle('past-word', index < currentIndex);
    });

    // Clear previous line classes
    document.querySelectorAll('.lyrics-line:not(.tagged-line)').forEach(line => {
        line.classList.remove('playing-line', 'next-playing-line', 'previous-playing-line', 'next-next-playing-line');
    });

    const lyricsLine = currentWord.element.closest('.lyrics-line');
    if (!lyricsLine || lyricsLine.classList.contains('tagged-line')) {
        const nearestLine = findNearestNonTaggedLine(currentWord.element);
        if (!nearestLine) return;
        lyricsLine = nearestLine;
    }

    // Function to find nearest non-tagged line
    function findNearestNonTaggedLine(element) {
        let current = element;
        while (current) {
            const line = current.closest('.lyrics-line');
            if (line && !line.classList.contains('tagged-line')) {
                return line;
            }
            current = current.nextElementSibling || current.parentElement.nextElementSibling;
        }
        return null;
    }

    // Function to get valid line (skipping tagged lines)
    function getValidLine(element, direction) {
        let currentElement = element;
        while (currentElement) {
            currentElement = direction === 'next' ? 
                currentElement.nextElementSibling : 
                currentElement.previousElementSibling;
                
            if (currentElement && !currentElement.classList.contains('tagged-line')) {
                return currentElement;
            }
        }
        return null;
    }

    // Add playing-line class
    lyricsLine.classList.add('playing-line');

    // Handle next lines
    const nextLine = getValidLine(lyricsLine, 'next');
    if (nextLine) {
        nextLine.classList.add('next-playing-line');
        const nextNextLine = getValidLine(nextLine, 'next');
        if (nextNextLine) {
            nextNextLine.classList.add('next-next-playing-line');
        }
    }

    // Handle previous line
    const previousLine = getValidLine(lyricsLine, 'previous');
    if (previousLine) {
        previousLine.classList.add('previous-playing-line');
    }

    // Auto-scroll in preview mode
    if (document.getElementById('lyrics-content').classList.contains('preview')) {
        const lyricsContent = document.getElementById('lyrics-content');
        const currentLineTop = lyricsLine.offsetTop;
        lyricsContent.scrollTop = currentLineTop - lyricsContent.clientHeight / 2 + 120;
    }
}, 1);

// events
elem_musicInput.addEventListener('change', function () {
    const file = this.files[0];
    const objectURL = URL.createObjectURL(file);
    elem_musicPlayer.src = objectURL;

    music_file = file;

    // remove extension from filename
    filename = file.name.split('.').slice(0, -1).join('.');

    jsmediatags.read(file, {
        onSuccess: function (tag) {
            document.getElementById('music-title').innerText = tag.tags.title || "Unknown Title";
            document.getElementById('music-artist').innerText = tag.tags.artist || "Unknown Artist";
            document.getElementById('music-album').innerText = tag.tags.album || "Unknown Album";

            // Array buffer to base64
            const data = tag.tags.picture.data
            const format = tag.tags.picture.format
            const base64String = btoa(String.fromCharCode.apply(null, data))

            document.getElementById('music-album-art').src = 'data:' + format + ';base64,' + base64String
        },
        onError: function (error) {
            console.error(error)
        }
    })

    if (!importedJSON) {
        currentLyrics = [];
        lastWordTime = 0;
        currentWordIndex = 0;
    }
});

// on play, reset goBackIndex
elem_musicPlayer.addEventListener('play', function () {
    goBackIndex = 0;
});

// shortcut spacebar to play/pause
document.addEventListener('keydown', function (event) {
    // check if we're in the lyrics input
    if (document.activeElement === elem_lyricsInput) {
        return;
    }
    if (event.keyCode === 32) {
        // if audioplayer is in focus, don't play/pause
        if (document.activeElement === elem_musicPlayer) {
            return;
        }

        playPause();

        // prevent spacebar from scrolling down
        event.preventDefault();
    }
});

// on arrow left, go back to last word and on arrow right, go to next word
document.addEventListener('keydown', function (event) {
    if (event.keyCode === 37) {
        goBackIndex -= 1;
    }
    if (event.keyCode === 39) {
        goBackIndex += 1;

        if (goBackIndex > 0) {
            goBackIndex = 0;
        }
    }

    // move to word
    if (event.keyCode === 37 || event.keyCode === 39) {
        let word = currentLyrics[currentWordIndex + goBackIndex];
        elem_musicPlayer.currentTime = word.time / 1000;
    }
});

// on click on .lyrics-word
document.addEventListener('click', function (event) {
    if (event.target.classList.contains('lyrics-word')) {
        const word = event.target;
        if (word.id) {
            const wordIndex = parseInt(word.id.split('-')[1]);
            openWord(wordIndex);

        }
    }
});

// properties change
document.getElementById('properties-start').addEventListener('change', function (event) {
    if (selectedWordIndex === -1) {
        return;
    }
    tempLyrics[selectedWordIndex].time = parseInt(event.target.value);
});

document.getElementById('properties-length').addEventListener('change', function (event) {
    if (selectedWordIndex === -1) {
        return;
    }
    tempLyrics[selectedWordIndex].duration = parseInt(event.target.value);

    /* make sure that the next word starts after this word ends
    const nextWord = currentLyrics[selectedWordIndex + 1];
    if (nextWord) {
        if (nextWord.time < currentLyrics[selectedWordIndex].time + currentLyrics[selectedWordIndex].duration) {
            nextWord.time = currentLyrics[selectedWordIndex].time + currentLyrics[selectedWordIndex].duration;
        }
    }

    // make sure that the previous word ends before this word starts
    const previousWord = currentLyrics[selectedWordIndex - 1];
    if (previousWord) {
        if (previousWord.time + previousWord.duration > currentLyrics[selectedWordIndex].time) {
            previousWord.duration = currentLyrics[selectedWordIndex].time - previousWord.time;
        }
    }*/

    // update duration of word in DOM
    tempLyrics[selectedWordIndex].element.style.setProperty('--duration', tempLyrics[selectedWordIndex].duration + 'ms');
});

document.getElementById('properties-preview').addEventListener('click', function (event) {
    const word = tempLyrics[selectedWordIndex];
    elem_musicPlayer.currentTime = word ? word.time / 1000 : 0;
    elem_musicPlayer.play();

    // stop preview after duration
    setTimeout(() => {
        elem_musicPlayer.pause();
    }, word.duration);
});

// on dom fully loaded
window.addEventListener('load', function () {
    document.getElementById('loading').style.display = 'none';
});

// dropdown
tippy('#file-drop', {
    content: `
        <div id="file-dropdown" class="dropdown-content">
            <button onclick="reset()">New</button>
            <button onclick="importKMAKE()">Open</button>
            <button onclick="exportKMAKE()">Save as</button>
        </div>
        <div id="export-dropdown" class="dropdown-content">
            <button onclick="exportJSON()" id="json-button">Export as JSON</button>
            <button onclick="exportLRC()" id="lrc-button">Export as LRC</button>
            <button onclick="exportELRC()" id="lrc-button">Export as eLRC</button>
        </div>
    `,
    allowHTML: true,
    trigger: 'click',
    interactive: true,
    animation: 'fade',
    arrow: false,
    theme: 'kmake-dropdown',
    placement: 'bottom-start',
});
tippy('#about-drop', {
    content: `
        <div id="about-dropdown" class="dropdown-content">
            <button>Kmake+</button>
            <button>${AppVersion.customName}</button>
            <button>V${AppVersion.version}</button>
            <button onclick="window.open('https://github.com/ecnivtwelve/kmake')">Originally Created By ecnivtwelve</button>
        </div>
    `,
    allowHTML: true,
    trigger: 'click',
    interactive: true,
    animation: 'fade',
    arrow: false,
    theme: 'kmake-dropdown',
    placement: 'bottom-start',
});
tippy('#preview-drop', {
    content: `
        <div id="preview-dropdown" class="dropdown-content">
        <div class="properties-item">
                            <p class="properties-title">Enable preview mode</p>
                            <div class="properties-content">
                                <input type="checkbox" id="preview-checkbox" onchange="previewToggle()"/>
                            </div>
                        </div>
                        <div class="properties-item">
                            <p class="properties-title">Preview theme</p>
                            <div class="properties-content">
                                <select id="preview-theme">
                                    <option value="default">Default</option>
                                    <option value="jd2014">jd2014</option>
                                    <option value="spotify">spotify</option>
                                    <option value="karafun">karafun</option>
                                </select>
                            </div>
                        </div>
        </div>
    `,
    allowHTML: true,
    trigger: 'click',
    interactive: true,
    animation: 'fade',
    arrow: false,
    theme: 'kmake-dropdown',
    placement: 'bottom-start',
});
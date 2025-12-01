// imports
const jsmediatags = window.jsmediatags

// global variables
let currentLyrics = []
let tempLyrics = []
let currentWordIndex = 0
let lastWordIndex = 0
let goBackIndex = 0
let importedJSON = false
let filename = ''
let selectedWordIndex = -1
let played_word = ''
let music_file = null
let isVisible = true
let metadata = {
    songWriters: [],
    curator: "Kmake"
}
const AppVersion = {
    version: '1.32-Kmake+',
    customName: 'Ibratabian17\'s Fork'
}

// dom elements
const elem_part_sortable = document.getElementsByClassName('part-sortable')
const elem_musicInput = document.getElementById('music-input')
const elem_musicPlayer = document.getElementById('music-player')
const elem_lyricsInput = document.getElementById('lyrics-input')
const elem_lyricsContent = document.getElementById('lyrics-content')
const elem_navbar = document.getElementById('navbar')
const elem_showMenu = document.querySelector('.show-more')

// plyr
const player = new Plyr(elem_musicPlayer, {
    controls: ['play', 'progress', 'current-time', 'mute', 'settings'],
    speed: {
        selected: 1,
        options: [0.5, 0.75, 1, 1.5]
    },
    youtube: {
        noCookie: true, 
        rel: 0, 
        showinfo: 0, 
        iv_load_policy: 3, 
        modestbranding: 1
    }
})

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
    Sortable.create(elem_part_sortable[i], {
        group: "part-sortable",
        handle: ".inner-part-title",
        animation: 150,
        filter: ".ignore-elements",
        ghostClass: "inner-part-ghost",
        chosenClass: "inner-part-chosen",
        dragClass: "inner-part-drag",
        store: {
            set: function (sortable) {
                var order = sortable.toArray()
                localStorage.setItem(sortable.options.group.name, order.join('|'))
            },
            get: function (sortable) {
                var order = localStorage.getItem(sortable.options.group.name)
                return order ? order.split('|') : []
            }
        }
    })
}

// tools
function msToTime(duration) {
    let milliseconds = parseInt((duration % 1000) / 10)
    let seconds = parseInt((duration / 1000) % 60)
    let minutes = parseInt((duration / (1000 * 60)) % 60)

    milliseconds = (milliseconds < 10) ? '0' + milliseconds : milliseconds
    seconds = (seconds < 10) ? '0' + seconds : seconds
    minutes = (minutes < 10) ? '0' + minutes : minutes

    return minutes + ':' + seconds + '.' + milliseconds
}

function splitTextWithSeparators(text) {
    if (!text) return ['']

    if (text.trim() === '') {
        return [text]
    }

    const separatorRegex = /(\]|-)/
    const parts = text.split(separatorRegex)
    const words = []

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i]

        if (part === ']' || part === '-') {
            if (words.length > 0) {
                words[words.length - 1] += part
            } else {
                words.push(part)
            }
        } else if (part) {
            const spaceWords = part.split(/(\s+)/)

            for (let j = 0; j < spaceWords.length; j++) {
                const spaceWord = spaceWords[j]

                if (/^\s+$/.test(spaceWord)) {
                    if (spaceWord.length === 1) {
                        if (words.length > 0) {
                            words[words.length - 1] += spaceWord
                        } else {
                            words.push(spaceWord)
                        }
                    } else {
                        if (words.length > 0) {
                            words[words.length - 1] += spaceWord.charAt(0)
                            for (let k = 1; k < spaceWord.length; k++) {
                                words.push(spaceWord.charAt(k))
                            }
                        } else {
                            for (let k = 0; k < spaceWord.length; k++) {
                                words.push(spaceWord.charAt(k))
                            }
                        }
                    }
                } else if (spaceWord) {
                    words.push(spaceWord)
                }
            }
        }
    }

    return words.length === 0 ? [text] : words
}

function isValidTag(text) {
    const trimmed = text.trim()
    return trimmed.startsWith('#') && trimmed.length > 1
}

function extractTagName(text) {
    return text.trim().substring(1)
}

// functional functions
function reset() {
    currentLyrics = []
    tempLyrics = []
    currentWordIndex = 0
    lastWordIndex = 0
    goBackIndex = 0
    importedJSON = false
    filename = ''
    selectedWordIndex = -1
    played_word = ''

    player.source = { type: 'audio', sources: [] };
    
    elem_musicInput.value = ''
    elem_lyricsInput.value = ''
    elem_lyricsContent.innerHTML = ''

    document.getElementById('music-title').innerText = ''
    document.getElementById('music-artist').innerText = ''
    document.getElementById('music-album').innerText = ''
    document.getElementById('music-album-art').src = ''
}

function importSong() {
    elem_musicInput.type = 'file'
    elem_musicInput.accept = '.mp3, .wav, .ogg, .flac, .m4a, .mp4, .opus, .mkv, .webm, .m3u8'
    elem_musicInput.click()
    elem_navbar.setAttribute('visible', 'false')
    isVisible = false
}

function importYoutube() {
    const url = prompt("Enter YouTube URL:");
    if (!url) return;

    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);

    if (match && match[2].length === 11) {
        const videoId = match[2];
        filename = `youtube-${videoId}`;

        player.source = {
            type: 'audio',
            sources: [
                {
                    src: videoId,
                    provider: 'youtube',
                },
            ],
        };

        fetch(`https://noembed.com/embed?url=${url}`)
            .then(response => response.json())
            .then(data => {
                document.getElementById('music-title').innerText = data.title || "YouTube Video";
                document.getElementById('music-artist').innerText = data.author_name || "YouTube";
                document.getElementById('music-album').innerText = "YouTube";
                if(data.thumbnail_url) {
                    document.getElementById('music-album-art').src = data.thumbnail_url;
                }
            })
            .catch(err => {
                console.error("Could not fetch YouTube metadata", err);
                document.getElementById('music-title').innerText = "YouTube Video";
            });

        if (!importedJSON) {
            currentLyrics = [];
            currentWordIndex = 0;
        }

        const plyCont= document.querySelector('.music-inner .plyr')
        plyCont.classList.remove('plyr--video')
        plyCont.classList.add('plyr--audio')
        
        elem_navbar.setAttribute('visible', 'false');
        isVisible = false;
    } else {
        alert("Invalid YouTube URL");
    }
}

function importJSON(files) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'

    if (!files) {
        input.click()
    }

    importedJSON = true

    input.addEventListener('change', function () {
        const file = this.files[0]
        if (!file) return

        const reader = new FileReader()
        reader.readAsText(file, 'UTF-8')
        reader.onload = function (evt) {
            try {
                const jsonData = JSON.parse(evt.target.result)
                const checkedData = Array.isArray(jsonData) ? jsonData : jsonData.lyrics && Array.isArray(jsonData.lyrics) ? jsonData.lyrics : []
                const lyricsData = parseJsonToLyrics(checkedData)
                const plainText = jsonData.plainText || ""

                elem_lyricsContent.innerHTML = ''
                elem_lyricsInput.value = plainText

                let currentLine = null
                let isNewLine = true

                lyricsData.forEach((lyric, index) => {
                    if (isNewLine) {
                        currentLine = document.createElement('p')
                        currentLine.classList.add('lyrics-line')
                        currentLine.classList.add(lyric.lineIndex % 2 === 0 ? 'even' : 'odd')
                        if (lyric.isTaggedLine) {
                            currentLine.classList.add('tagged-line')
                        }
                        isNewLine = false
                    }

                    const span = document.createElement('span')
                    span.classList.add('lyrics-word')
                    span.innerText = lyric.text.replace(']', '')
                    span.id = 'word-' + index
                    if (isRTL(lyric.text)) span.classList.add('rtl-word')
                    if (lyric.isDone) {
                        span.classList.add('done-word')
                        span.style.setProperty('--duration', lyric.duration + 'ms')
                    }
                    span.style.setProperty('--duration', lyric.duration + 'ms')
                    lyricsData[index].element = span
                    currentLine.appendChild(span)

                    if (lyric.isLineEnding) {
                        elem_lyricsContent.appendChild(currentLine)
                        isNewLine = true
                    }
                })

                tempLyrics = lyricsData
                currentWordIndex = tempLyrics.length > 0 ? tempLyrics.length - 1 : 0
            } catch (error) {
                console.error('Error parsing JSON:', error)
                alert('Error parsing JSON file. Please check the file format.')
            }
        }
    })

    if (files) {
        const dataTransfer = new DataTransfer()
        for (let i = 0; i < files.length; i++) {
            dataTransfer.items.add(files[i])
        }
        input.files = dataTransfer.files
        input.dispatchEvent(new Event('change'))
    }
}

function parseJsonToLyrics(jsonData) {
    if (!Array.isArray(jsonData)) return []

    const newLyrics = []
    let previousSongPart = null
    let offset = 0
    let lineIndex = 0

    jsonData.forEach((item, idx) => {
        if (!item || typeof item !== 'object') return

        const words = item.text || ''
        const element = item.element || {}
        const songPart = element.songPart || null

        if (songPart && songPart !== previousSongPart) {
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
                    singer: element.singer || null
                },
                element: {},
                offset: offset,
                lineIndex: lineIndex,
                wordIndex: offset
            }
            newLyrics.push(tagFormat)
            previousSongPart = songPart
        }

        const wordData = {
            time: item.time || 0,
            duration: item.duration || 0,
            text: words,
            isLineEnding: item.isLineEnding == 1,
            isTaggedLine: false,
            tag: null,
            tempElement: {
                key: `L${lineIndex}`,
                songPart: songPart,
                singer: element.singer || null
            },
            element: {},
            offset: offset,
            lineIndex: lineIndex,
            wordIndex: offset,
            isDone: true
        }

        newLyrics.push(wordData)
        if (item.isLineEnding == 1) lineIndex++
        offset++
    })

    if (jsonData.length > 0) {
        const lastItem = jsonData[jsonData.length - 1]
        const endOfLineTag = {
            time: (lastItem.time || 0) + (lastItem.duration || 0),
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
        }
        newLyrics.push(endOfLineTag)
    }

    return newLyrics
}

function cleanText(text) {
    return (text || '').replace(/[\]\-\s]/g, '').toLowerCase()
}

function parseLyrics() {
    if (elem_lyricsInput.value.trim() === '') {
        return
    }

    elem_lyricsContent.innerHTML = ''

    const newLyrics = []
    const lines = `${elem_lyricsInput.value}\n#ENDOFLINE`.split('\n')
    let currentTag = ""

    let totalOffset = 0
    
    lines.forEach((line, lineIndex) => {
        const p = document.createElement('p')
        p.classList.add('lyrics-line')
        p.classList.add(lineIndex % 2 === 0 ? 'even' : 'odd')

        let isTaggedLine = false
        const trimmedLine = line.trim()
        
        if (isValidTag(trimmedLine)) {
            isTaggedLine = true
            currentTag = extractTagName(trimmedLine)
            p.classList.add('tagged-line')
        }

        const words = isTaggedLine ? [trimmedLine] : splitTextWithSeparators(line)

        words.forEach((word, wordIndex) => {
            const span = document.createElement('span')
            const displayText = word.replace(/\]/g, '')
            
            span.classList.add('lyrics-word')
            span.innerText = displayText
            
            if (displayText.trim() === '') span.classList.add('lyrics-space')
            if (isRTL(displayText)) span.classList.add('rtl-word')
            span.id = 'word-' + totalOffset

            const wordData = {
                time: 0,
                duration: 0,
                text: word,
                displayText: displayText,
                isLineEnding: wordIndex === words.length - 1,
                isTaggedLine: isTaggedLine,
                tag: isTaggedLine ? currentTag : null,
                tempElement: {
                    key: `L${lineIndex}`,
                    songPart: currentTag,
                    singer: 'v1'
                },
                element: span,
                offset: totalOffset,
                lineIndex: lineIndex,
                wordIndex: wordIndex,
                isDone: false
            }

            p.appendChild(span)
            newLyrics.push(wordData)
            totalOffset++
        })
        elem_lyricsContent.appendChild(p)
    })

    let oldCursor = 0

    for (let i = 0; i < newLyrics.length; i++) {
        let newWord = newLyrics[i]
        let matchedOldData = null

        const searchLimit = 10

        for (let k = 0; k < searchLimit; k++) {
            let checkIndex = oldCursor + k
            if (checkIndex >= tempLyrics.length) break

            let oldWord = tempLyrics[checkIndex]

            if (newWord.isTaggedLine !== oldWord.isTaggedLine) continue

            const nTxt = cleanText(newWord.text)
            const oTxt = cleanText(oldWord.text)

            if (nTxt === oTxt) {
                matchedOldData = oldWord
                oldCursor = checkIndex + 1
                break
            }

            if (oTxt.startsWith(nTxt) && nTxt.length > 0) {
                matchedOldData = oldWord
                oldCursor = checkIndex + 1
                break
            }

            if (nTxt.startsWith(oTxt) && oTxt.length > 0) {
                matchedOldData = oldWord
                oldCursor = checkIndex + 1
                break
            }
        }

        if (matchedOldData) {
            newWord.time = matchedOldData.time || 0
            newWord.duration = matchedOldData.duration || 0
            newWord.isDone = matchedOldData.isDone || false

            if (newWord.isDone && newWord.element) {
                newWord.element.classList.add('done-word')
                newWord.element.style.setProperty('--duration', newWord.duration + 'ms')
            }
        }
    }

    tempLyrics = newLyrics
}

function nextWord() {
    const NextWordButton = document.getElementById('nextword-button')
    if (NextWordButton) {
        NextWordButton.classList.add('enabled')
        setTimeout(() => {
            NextWordButton.classList.remove('enabled')
        }, 50)
    }

    const time = player.currentTime * 1000
    let currentWord = tempLyrics[currentWordIndex]
    let lastWord = tempLyrics[currentWordIndex - 1]
    lastWordIndex = currentWordIndex - 1

    while (currentWord && currentWord.isTaggedLine && currentWord.text !== "#ENDOFLINE") {
        currentWordIndex++
        currentWord = tempLyrics[currentWordIndex]
        lastWord = tempLyrics[currentWordIndex - 1]
    }

    if (lastWord && lastWord.isTaggedLine && lastWordIndex !== -1) {
        lastWordIndex++
        lastWord = tempLyrics[lastWordIndex]
    }

    if (!currentWord) {
        return
    }

    const pWordIndex = tempLyrics.findIndex(word => word.element && word.element.classList.contains('current-word'))
    if (pWordIndex !== -1 && tempLyrics[pWordIndex].element) {
        tempLyrics[pWordIndex].element.classList.remove('current-word')
    }

    currentWord.time = time
    currentWord.isDone = true
    currentWord.duration = 0

    if (lastWord && lastWordIndex >= 0) {
        const lastWordTime = lastWord.time || 0
        const difference = time - lastWordTime
        lastWord.duration = Math.max(0, difference)
        if (lastWord.element) {
            lastWord.element.style.setProperty('--duration', lastWord.duration + 'ms')
        }
    }

    if (currentWord.element) {
        currentWord.element.classList.add('current-word')
        currentWord.element.classList.add('playing-word')
    }

    if (lastWord && lastWord.element) {
        lastWord.element.classList.add('done-word')
        lastWord.element.classList.remove('current-word')
    }

    currentWordIndex++

    if (currentWord.element) {
        const elem_lyricsContent = document.getElementById('lyrics-content')
        elem_lyricsContent.scrollTop = currentWord.element.offsetTop - elem_lyricsContent.offsetTop - 100
    }

    if (currentWordIndex >= tempLyrics.length) {
        setTimeout(() => {
            if (currentWord.element) {
                currentWord.element.classList.remove('current-word')
                currentWord.element.classList.add('done-word')
            }
        }, 500)
    }
}

function openWord(wordIndex) {
    if (wordIndex < 0 || wordIndex >= tempLyrics.length) return

    const word = tempLyrics[wordIndex]
    if (!word) return

    currentWordIndex = wordIndex
    selectedWordIndex = wordIndex

    document.querySelectorAll('.opened-word').forEach(el => el.classList.remove('opened-word'))
    if (word.element) {
        word.element.classList.add('opened-word')
    }

    document.getElementById('properties-word').innerText = word.text || ''
    document.getElementById('properties-start').value = word.time || 0
    document.getElementById('properties-length').value = word.duration || 0

    player.currentTime = (word.time || 0) / 1000
}

function unselect() {
    selectedWordIndex = -1
    document.querySelectorAll('.opened-word').forEach(el => el.classList.remove('opened-word'))

    document.getElementById('properties-word').innerText = ''
    document.getElementById('properties-start').value = 0
    document.getElementById('properties-length').value = 0
}

function isRTL(s) {
    if (!s || typeof s !== 'string') return false

    var ltrChars = 'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0300-\u0590\u0800-\u1FFF' + '\u2C00-\uFB1C\uFDFE-\uFE6F\uFEFD-\uFFFF',
        rtlChars = '\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC',
        rtlDirCheck = new RegExp('^[^' + ltrChars + ']*[' + rtlChars + ']')

    return rtlDirCheck.test(s)
}

// UI functions
function playPause() {
    const playPauseButton = document.getElementById('playpause-button')
    if (playPauseButton) {
        playPauseButton.classList.add('enabled')
        setTimeout(() => {
            playPauseButton.classList.remove('enabled')
        }, 50)
    }

    if (player.paused) {
        player.play()
    } else {
        player.pause()
    }
}

function previewToggle() {
    document.getElementById('lyrics-content').classList.toggle('preview')

    if (document.querySelector('#preview-mode').innerHTML == 'Preview mode') {
        document.querySelector('.part-left').setAttribute('visible', 'false')
        document.querySelector('#preview-mode').innerHTML = 'Edit mode'
    } else {
        document.querySelector('.part-left').setAttribute('visible', 'true')
        document.querySelector('#preview-mode').innerHTML = 'Preview mode'
    }

    const previewCheckbox = document.getElementById('preview-checkbox')
    if (previewCheckbox) {
        previewCheckbox.checked = document.getElementById('lyrics-content').classList.contains('preview')
    }
}

document.getElementById('preview-theme')?.addEventListener('change', () => {
    document.getElementById('lyrics-content').setAttribute('data-theme', document.getElementById('preview-theme').value)
})

// exports
function prepareJSON(cleanTiming = true) {
    if (!tempLyrics || tempLyrics.length === 0) {
        return new Blob(['{}'], { type: 'application/json' })
    }
    
    let exportedLyrics = tempLyrics
    
    if (cleanTiming) {
        exportedLyrics = tempLyrics
            .filter(word => word && word.text && word.text.trim() !== '')
            .filter(word => !word.isTaggedLine)
    }
    
    exportedLyrics = exportedLyrics.map(item => ({
        time: Math.round(item.time || 0),
        duration: Math.round(item.duration || 0),
        text: cleanTiming ? (item.displayText || item.text || '').replace(/\]/g, '') : (item.text || ''),
        isLineEnding: item.isLineEnding ? 1 : 0,
        element: item.tempElement ? {
            key: item.tempElement.key || '',
            songPart: item.tempElement.songPart || null,
            singer: item.tempElement.singer || null
        } : {}
    }))

    const plainText = elem_lyricsInput.value !== "" ? elem_lyricsInput.value : undefined

    const formattedJSON = {
        type: "Word",
        KpoeTools: AppVersion.version,
        metadata: metadata,
        lyrics: exportedLyrics,
        plainText: plainText,
        isNotRaw: cleanTiming
    }

    const json = JSON.stringify(formattedJSON, null, 4)
    const blob = new Blob([json], { type: 'application/json' })
    return blob
}

function prepareLRC() {
    if (!tempLyrics || tempLyrics.length === 0) {
        return new Blob([''], { type: 'text/plain' })
    }

    let lrcContent = ''
    let currentPhraseTime = ''
    let currentPhrase = ''

    tempLyrics.forEach((word, index) => {
        if (!word || word.isTaggedLine) return

        if (index === 0 || tempLyrics[index - 1].isLineEnding === true) {
            if (currentPhrase !== '') {
                lrcContent += '[' + currentPhraseTime + ']' + currentPhrase.trim() + '\n'
            }
            currentPhraseTime = msToTime(word.time || 0)
            currentPhrase = word.text || ''
        } else {
            currentPhrase += word.text || ''
        }
    })

    if (currentPhrase !== '') {
        lrcContent += '[' + currentPhraseTime + ']' + currentPhrase.trim() + '\n'
    }

    const formattedContent = lrcContent.trim()
    const blob = new Blob([formattedContent], { type: 'text/plain' })
    return blob
}

function prepareELRC() {
    if (!tempLyrics || tempLyrics.length === 0) {
        return new Blob([''], { type: 'text/plain' })
    }

    let lrcContent = ''

    tempLyrics.forEach((word, index) => {
        if (!word || word.isTaggedLine) return

        if (index === 0 || tempLyrics[index - 1].isLineEnding === true) {
            lrcContent += '\n[' + msToTime(word.time || 0) + ']' + (word.text || '')
        } else {
            lrcContent += ' <' + msToTime(word.time || 0) + '>' + (word.text || '')
        }
    })

    const formattedContent = lrcContent.trim()
    const blob = new Blob([formattedContent], { type: 'text/plain' })
    return blob
}

function exportJSON() {
    const blob = prepareJSON()
    downloadBlob(blob)
}

function exportLRC() {
    const blob = prepareLRC()
    downloadBlob(blob, 'lrc')
}

function exportELRC() {
    const blob = prepareELRC()
    downloadBlob(blob, 'lrc')
}

function downloadBlob(blob, format = 'json') {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')

    a.href = url
    a.download = (filename || 'untitled') + '.' + format
    a.click()

    setTimeout(() => URL.revokeObjectURL(url), 100)
}

function exportKMAKE() {
    if (!music_file) {
        alert('Please import a music file first.')
        return
    }

    var zip = new JSZip()

    zip.file("audiofile.kmakefile", music_file)

    let jsonLyrics = prepareJSON(false)
    zip.file("lyrics.kmakefile", jsonLyrics)

    const options = {
        type: 'blob',
        mimeType: 'application/kmake',
    }

    zip.generateAsync(options).then(function (content) {
        downloadBlob(content, 'kmake')
    })
}

function importKMAKE() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.kmake'
    input.onchange = e => {
        reset()

        const file = e.target.files[0]
        if (file) {
            const reader = new FileReader()
            reader.readAsArrayBuffer(file)
            reader.onload = readerEvent => {
                const content = readerEvent.target.result
                JSZip.loadAsync(content).then(function (zip) {
                    const audioFile = zip.file("audiofile.kmakefile")
                    if (audioFile) {
                        audioFile.async("blob").then(function (content) {
                            const file = new File([content], 'audiofile.mp3')

                            const fileList = new DataTransfer()
                            fileList.items.add(file)

                            elem_musicInput.files = fileList.files
                            elem_musicInput.dispatchEvent(new Event('change'))
                        })
                    }

                    const lyricsFile = zip.file("lyrics.kmakefile")
                    if (lyricsFile) {
                        lyricsFile.async("string").then(function (content) {
                            const file = new File([content], 'lyrics.json')

                            const fileList = new DataTransfer()
                            fileList.items.add(file)

                            importJSON(fileList.files)
                        })
                    }
                }).catch(error => {
                    console.error('Error loading KMAKE file:', error)
                    alert('Error loading KMAKE file. Please check the file format.')
                })
            }
        }
    }
    input.click()
}

// shortcuts
document.addEventListener('keydown', function (event) {
    if (document.activeElement === elem_lyricsInput) {
        return
    }
    if (event.keyCode === 13) {
        event.preventDefault()
        nextWord()
    }
})

// playback
setInterval(() => {
    if (!tempLyrics || tempLyrics.length === 0) return

    if (player.paused) {
        document.getElementById('lyrics-content').classList.add('paused')
    } else {
        document.getElementById('lyrics-content').classList.remove('paused')
    }

    const time = player.currentTime * 1000

    let currentWord = null
    for (let i = 0; i < tempLyrics.length; i++) {
        const word = tempLyrics[i]
        if (!word || (word.time || 0) > time) {
            let previousWord = tempLyrics[i - 1]
            while (previousWord && previousWord.isTaggedLine && i > 0) {
                i--
                previousWord = tempLyrics[i - 1]
            }
            currentWord = previousWord || null
            break
        }
    }

    const playingWordElement = document.querySelector('.playing-word')
    if (playingWordElement) {
        playingWordElement.classList.remove('playing-word')
    }

    if (currentWord && currentWord.element) {
        currentWord.element.classList.add('playing-word')
    }

    if (currentWord && currentWord.text === played_word) {
        return
    } else if (!currentWord) {
        played_word = ''
        return
    } else {
        played_word = currentWord.text
    }

    const allWords = Array.from(document.querySelectorAll('.lyrics-word')).filter(word => {
        const wordIndex = parseInt(word.id.split('-')[1])
        return wordIndex >= 0 && wordIndex < tempLyrics.length && !tempLyrics[wordIndex]?.isTaggedLine
    })

    const currentIndex = currentWord.element ? allWords.indexOf(currentWord.element) : -1
    allWords.forEach((word, index) => {
        word.classList.toggle('past-word', index < currentIndex)
    })

    document.querySelectorAll('.lyrics-line:not(.tagged-line)').forEach(line => {
        line.classList.remove('playing-line', 'next-playing-line', 'previous-playing-line', 'next-next-playing-line')
    })

    if (!currentWord || !currentWord.element) return

    const lyricsLine = currentWord.element.closest('.lyrics-line')
    if (!lyricsLine || lyricsLine.classList.contains('tagged-line')) {
        return
    }

    function getValidLine(element, direction) {
        let currentElement = element
        while (currentElement) {
            currentElement = direction === 'next' ?
                currentElement.nextElementSibling :
                currentElement.previousElementSibling

            if (currentElement && !currentElement.classList.contains('tagged-line')) {
                return currentElement
            }
        }
        return null
    }

    lyricsLine.classList.add('playing-line')

    const nextLine = getValidLine(lyricsLine, 'next')
    if (nextLine) {
        nextLine.classList.add('next-playing-line')
        const nextNextLine = getValidLine(nextLine, 'next')
        if (nextNextLine) {
            nextNextLine.classList.add('next-next-playing-line')
        }
    }

    const previousLine = getValidLine(lyricsLine, 'previous')
    if (previousLine) {
        previousLine.classList.add('previous-playing-line')
    }

    if (document.getElementById('lyrics-content').classList.contains('preview')) {
        const lyricsContent = document.getElementById('lyrics-content')
        const currentLineTop = lyricsLine.offsetTop
        lyricsContent.scrollTop = currentLineTop - lyricsContent.clientHeight / 2 + 120
    }
}, 1)

// events
elem_musicInput.addEventListener('change', function () {
    const file = this.files[0]
    if (!file) return

    const objectURL = URL.createObjectURL(file)
    
    player.source = {
        type: 'audio',
        title: 'Local File',
        sources: [
            {
                src: objectURL,
                type: file.type || 'audio/mp3', 
            },
        ],
    };

    music_file = file
    document.getElementById('music-title').innerText = "Unknown Title"
    document.getElementById('music-artist').innerText = "Unknown Artist"
    document.getElementById('music-album').innerText = "Unknown Album"
    document.getElementById('music-album-art').src = ''

    filename = file.name.split('.').slice(0, -1).join('.')

    jsmediatags.read(file, {
        onSuccess: function (tag) {
            document.getElementById('music-title').innerText = tag.tags.title || "Unknown Title"
            document.getElementById('music-artist').innerText = tag.tags.artist || "Unknown Artist"
            document.getElementById('music-album').innerText = tag.tags.album || "Unknown Album"

            if (tag.tags.picture) {
                const data = tag.tags.picture.data
                const format = tag.tags.picture.format
                const base64String = btoa(String.fromCharCode.apply(null, data))
                document.getElementById('music-album-art').src = `data:${format};base64,${base64String}`
            } else {
                document.getElementById('music-album-art').src = ''
            }

            if (tag.tags["TXXX"] && tag.tags["TXXX"].description === "Writer") {
                metadata.songWriters = tag.tags["TXXX"].split(',').map(s => s.trim())
            } else {
                metadata.songWriters = []
            }
        },
        onError: function (error) {
            console.error('Media tags error:', error)
        }
    })

    if (!importedJSON) {
        currentLyrics = []
        currentWordIndex = 0
    }
})

player.on('play', function () {
    goBackIndex = 0
})

document.addEventListener('keydown', function (event) {
    if (document.activeElement === elem_lyricsInput) {
        return
    }
    if (event.keyCode === 32) {
        if (document.activeElement.tagName === 'BUTTON' || document.activeElement === elem_musicPlayer) {
            return
        }

        playPause()
        event.preventDefault()
    }
})

document.addEventListener('keydown', function (event) {
    if (document.activeElement === elem_lyricsInput) {
        return
    }

    if (event.keyCode === 37) {
        goBackIndex -= 1
    }
    if (event.keyCode === 39) {
        goBackIndex += 1

        if (goBackIndex > 0) {
            goBackIndex = 0
        }
    }

    if (event.keyCode === 37 || event.keyCode === 39) {
        const targetIndex = currentWordIndex + goBackIndex
        if (targetIndex >= 0 && targetIndex < tempLyrics.length) {
            let word = tempLyrics[targetIndex]
            if (word && word.time !== undefined) {
                player.currentTime = word.time / 1000
            }
        }
    }
})

document.addEventListener('click', function (event) {
    if (event.target.classList.contains('lyrics-word')) {
        const word = event.target
        if (word.id) {
            const wordIndex = parseInt(word.id.split('-')[1])
            if (!isNaN(wordIndex)) {
                openWord(wordIndex)
            }
        }
    }
})

document.getElementById('properties-start')?.addEventListener('change', function (event) {
    if (selectedWordIndex === -1 || selectedWordIndex >= tempLyrics.length) {
        return
    }
    const newTime = parseInt(event.target.value) || 0
    tempLyrics[selectedWordIndex].time = Math.max(0, newTime)
})

document.getElementById('properties-length')?.addEventListener('change', function (event) {
    if (selectedWordIndex === -1 || selectedWordIndex >= tempLyrics.length) {
        return
    }
    const newDuration = parseInt(event.target.value) || 0
    tempLyrics[selectedWordIndex].duration = Math.max(0, newDuration)

    if (tempLyrics[selectedWordIndex].element) {
        tempLyrics[selectedWordIndex].element.style.setProperty('--duration', tempLyrics[selectedWordIndex].duration + 'ms')
    }
})

document.getElementById('properties-preview')?.addEventListener('click', function (event) {
    if (selectedWordIndex === -1 || selectedWordIndex >= tempLyrics.length) {
        return
    }

    const word = tempLyrics[selectedWordIndex]
    if (!word) return

    player.currentTime = (word.time || 0) / 1000
    player.play()

    const duration = word.duration || 1000
    setTimeout(() => {
        player.pause()
    }, duration)
})

window.addEventListener('load', function () {
    const loadingElement = document.getElementById('loading')
    if (loadingElement) {
        loadingElement.style.display = 'none'
    }
})

// dropdown
if (typeof tippy !== 'undefined') {
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
                <button onclick="exportELRC()" id="elrc-button">Export as eLRC</button>
            </div>
        `,
        allowHTML: true,
        trigger: 'click',
        interactive: true,
        animation: 'fade',
        arrow: false,
        theme: 'kmake-dropdown',
        placement: 'bottom-start',
    })

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
    })

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
    })
}
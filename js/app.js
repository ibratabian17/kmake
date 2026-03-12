const jsmediatags = window.jsmediatags

let currentLyrics = []
let tempLyrics = []         // array of line objects including tagged (section/agent) entries
let allSyllables = []       // flat cursor array: [{ lineIdx, syllabusIdx }], tagged lines excluded
let currentWordIndex = 0    // current position in allSyllables
let lastWordIndex = 0
let goBackIndex = 0
let importedJSON = false
let filename = ''
let selectedWordIndex = -1
let played_word = ''
let music_file = null
let isVisible = true
let metadata = {
    source: "",
    title: "",
    language: "",
    songWriters: [],
    agents: { "v1": { type: "person", name: "", alias: "v1" } },
    songParts: [],
    totalDuration: "",
    curator: "Kmake"
}
const AppVersion = {
    version: '2.0-kmakeEditor',
    customName: 'Ibratabian17\'s Fork'
}

const elem_part_sortable = document.getElementsByClassName('part-sortable')
const elem_musicInput = document.getElementById('music-input')
const elem_musicPlayer = document.getElementById('music-player')
const elem_lyricsInput = document.getElementById('lyrics-input')
const elem_lyricsContent = document.getElementById('lyrics-content')
const elem_navbar = document.getElementById('navbar')
const elem_showMenu = document.querySelector('.show-more')

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

function extractAgentDeclaration(text) {
    const regex = /^\[agent:(person|group|other|virtual)=([^:]+)(?::(.*))?\]$/i;
    const match = text.trim().match(regex);
    if (match) {
        return {
            type: match[1].toLowerCase(),
            alias: match[2],
            name: match[3] || ''
        };
    }
    return null;
}

function reset() {
    currentLyrics = []
    tempLyrics = []
    allSyllables = []
    currentWordIndex = 0
    lastWordIndex = 0
    goBackIndex = 0
    importedJSON = false
    filename = ''
    selectedWordIndex = -1
    played_word = ''

    metadata = {
        source: "",
        title: "",
        language: "",
        songWriters: [],
        agents: { "v1": { type: "person", name: "", alias: "v1" } },
        songParts: [],
        totalDuration: "",
        curator: "Kmake"
    }

    player.source = { type: 'audio', sources: [] }

    elem_musicInput.value = ''
    elem_lyricsInput.value = ''
    elem_lyricsContent.innerHTML = ''

    document.getElementById('music-title').innerText = ''
    document.getElementById('music-artist').innerText = ''
    document.getElementById('music-album').innerText = ''
    document.getElementById('music-album-art').src = ''
}

// Rebuilds flat allSyllables cursor from tempLyrics. Must be called after any tempLyrics change.
function buildAllSyllables() {
    allSyllables = []
    for (let li = 0; li < tempLyrics.length; li++) {
        const line = tempLyrics[li]
        if (!line || line.isTaggedLine) continue
        const syllabus = line.syllabus || []
        for (let si = 0; si < syllabus.length; si++) {
            allSyllables.push({ lineIdx: li, syllabusIdx: si })
        }
    }
    // Virtual ENDOFLINE entry — lets the user press Enter one more time
    // after the last real syllable to set its duration
    allSyllables.push({ lineIdx: -1, syllabusIdx: -1, isEndOfLine: true })
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
                if (data.thumbnail_url) {
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

        const plyCont = document.querySelector('.music-inner .plyr')
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
                const fmt = detectKpoeFormat(jsonData)

                elem_lyricsContent.innerHTML = ''

                if (fmt === 'v2') {
                    parseNewKpoeFormat(jsonData)
                } else {
                    parseLegacyToV2(jsonData)
                }
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

function detectKpoeFormat(jsonData) {
    const lyrics = jsonData.lyrics
    if (Array.isArray(lyrics) && lyrics.length > 0 && Array.isArray(lyrics[0].syllabus)) {
        return 'v2'
    }
    return 'v1'
}

function parseNewKpoeFormat(jsonData) {
    const meta = jsonData.metadata || {}
    metadata.source = meta.source || ''
    metadata.title = meta.title || ''
    metadata.language = meta.language || ''
    metadata.songWriters = meta.songWriters || []
    metadata.agents = meta.agents || { v1: { type: 'person', name: '', alias: 'v1' } }
    metadata.songParts = meta.songParts || []
    metadata.totalDuration = meta.totalDuration || ''

    const lyricsArr = jsonData.lyrics || []
    const newLyrics = []
    let lineIndex = 0
    let prevPartIdx = -1
    let plainText = ''

    for (const alias in metadata.agents) {
        const agent = metadata.agents[alias]
        plainText += agent.name
            ? `[agent:${agent.type}=${alias}:${agent.name}]\n`
            : `[agent:${agent.type}=${alias}]\n`
    }
    if (Object.keys(metadata.agents).length > 0) plainText += '\n'

    lyricsArr.forEach((item) => {
        if (!item) return
        const el = item.element || {}
        const partIdx = el.songPartIndex != null ? el.songPartIndex : -1

        if (partIdx !== prevPartIdx && partIdx >= 0 && metadata.songParts[partIdx]) {
            const partName = metadata.songParts[partIdx].name
            plainText += '#' + partName + '\n'
            newLyrics.push({
                time: 0, duration: 0,
                text: '#' + partName,
                syllabus: [],
                element: { key: 'tag-' + partIdx, singer: null, songPartIndex: partIdx },
                isTaggedLine: true,
                tag: partName,
                lineIndex: lineIndex,
                lineElement: null
            })
            prevPartIdx = partIdx
            lineIndex++
        }

        const rawSyllabus = item.syllabus || []
        const syllabus = rawSyllabus.map(s => ({
            time: s.time || 0,
            duration: s.duration || 0,
            text: s.text || '',
            isDone: (s.time || 0) > 0,
            element: null
        }))

        newLyrics.push({
            time: item.time || 0,
            duration: item.duration || 0,
            text: item.text || '',
            syllabus: syllabus,
            element: {
                key: el.key || ('L' + lineIndex),
                singer: el.singer || 'v1',
                songPartIndex: partIdx
            },
            isTaggedLine: false, tag: null,
            lineIndex: lineIndex, lineElement: null
        })
        const singer = el.singer || 'v1'
        plainText += `${singer}:${item.text || ''}\n`
        lineIndex++
    })

    tempLyrics = newLyrics
    elem_lyricsInput.value = plainText.trim()
    rebuildLyricsDOM()
    buildAllSyllables()
    _seekToFirstUnsynced()
}

function parseLegacyToV2(jsonData) {
    const raw = Array.isArray(jsonData) ? jsonData : (jsonData.lyrics || [])
    const plainText = jsonData.plainText || ''

    const lineGroups = []
    let currentGroup = []
    raw.forEach((item) => {
        if (!item) return
        currentGroup.push(item)
        if (item.isLineEnding == 1) {
            lineGroups.push(currentGroup)
            currentGroup = []
        }
    })
    if (currentGroup.length) lineGroups.push(currentGroup)

    // Each contiguous run of the same songPart name gets its own songParts entry (duplicates allowed)
    metadata.songParts = []
    let prevSpName = null
    lineGroups.forEach(group => {
        const spName = group[0]?.element?.songPart || null
        if (spName && spName !== prevSpName) {
            metadata.songParts.push({ name: spName, time: 0, duration: 0 })
        }
        prevSpName = spName
    })

    // Map each group to its songPartIndex by re-walking in order
    const groupPartIndices = []
    let partCursor = -1
    prevSpName = null
    lineGroups.forEach(group => {
        const spName = group[0]?.element?.songPart || null
        if (spName && spName !== prevSpName) {
            partCursor++
            prevSpName = spName
        }
        groupPartIndices.push(spName ? partCursor : -1)
    })

    const newLyrics = []
    let lineIndex = 0
    let prevPartIdx = -1
    let rebuiltPlainText = ''

    for (const alias in metadata.agents) {
        const agent = metadata.agents[alias]
        rebuiltPlainText += agent.name
            ? `[agent:${agent.type}=${alias}:${agent.name}]\n`
            : `[agent:${agent.type}=${alias}]\n`
    }
    if (Object.keys(metadata.agents).length > 0) rebuiltPlainText += '\n'

    lineGroups.forEach((group, gi) => {
        if (!group.length) return
        const spName = group[0]?.element?.songPart || null
        const partIdx = groupPartIndices[gi]

        if (partIdx !== prevPartIdx && partIdx >= 0) {
            rebuiltPlainText += '#' + spName + '\n'
            newLyrics.push({
                time: 0, duration: 0,
                text: '#' + spName,
                syllabus: [],
                element: { key: 'tag-' + partIdx, singer: null, songPartIndex: partIdx },
                isTaggedLine: true, tag: spName,
                lineIndex: lineIndex, lineElement: null
            })
            prevPartIdx = partIdx
            lineIndex++
        }

        const syllabus = group.map(w => ({
            time: w.time || 0,
            duration: w.duration || 0,
            text: (w.displayText || w.text || '').replace(/]/g, ''),
            isDone: (w.time || 0) > 0,
            element: null
        }))

        const firstItem = group[0]
        const lastItem = group[group.length - 1]
        const lineText = syllabus.map(s => s.text).join('')

        newLyrics.push({
            time: firstItem.time || 0,
            duration: (lastItem.time || 0) + (lastItem.duration || 0) - (firstItem.time || 0),
            text: lineText,
            syllabus: syllabus,
            element: {
                key: firstItem.element?.key || ('L' + lineIndex),
                singer: firstItem.element?.singer || 'v1',
                songPartIndex: partIdx
            },
            isTaggedLine: false, tag: null,
            lineIndex: lineIndex, lineElement: null
        })
        const singer = firstItem.element?.singer || 'v1'
        rebuiltPlainText += `${singer}:${lineText}\n`
        lineIndex++
    })

    tempLyrics = newLyrics
    elem_lyricsInput.value = (plainText || rebuiltPlainText).trim()
    rebuildLyricsDOM()
    buildAllSyllables()
    _seekToFirstUnsynced()
}

function parseJsonToLyrics(jsonData) {
    const wrapper = Array.isArray(jsonData) ? { lyrics: jsonData } : jsonData
    parseLegacyToV2(wrapper)
    return tempLyrics
}

function rebuildLyricsDOM() {
    elem_lyricsContent.innerHTML = ''
    let lineDisplayIdx = 0

    tempLyrics.forEach((line, li) => {
        const p = document.createElement('p')
        p.classList.add('lyrics-line')

        if (line.isTaggedLine) {
            p.classList.add('tagged-line')
            p.classList.add(lineDisplayIdx % 2 === 0 ? 'even' : 'odd')
            const span = document.createElement('span')
            span.classList.add('lyrics-word')
            span.innerText = line.text
            span.id = 'line-' + li
            p.appendChild(span)
            elem_lyricsContent.appendChild(p)
            line.lineElement = p
            return
        }

        p.classList.add(lineDisplayIdx % 2 === 0 ? 'even' : 'odd')
        line.lineElement = p

            ; (line.syllabus || []).forEach((syl, si) => {
                const span = document.createElement('span')
                span.classList.add('lyrics-word')
                span.innerText = syl.text
                span.id = 'syl-' + li + '-' + si
                if (isRTL(syl.text)) span.classList.add('rtl-word')
                if (syl.isDone) {
                    span.classList.add('done-word')
                    span.style.setProperty('--duration', syl.duration + 'ms')
                }
                syl.element = span
                p.appendChild(span)
            })

        elem_lyricsContent.appendChild(p)
        lineDisplayIdx++
    })
}

function _seekToFirstUnsynced() {
    currentWordIndex = allSyllables.length // default: all done
    for (let i = 0; i < allSyllables.length; i++) {
        const entry = allSyllables[i]
        if (entry.isEndOfLine) continue
        if (!tempLyrics[entry.lineIdx].syllabus[entry.syllabusIdx].isDone) {
            currentWordIndex = i
            break
        }
    }
}

function cleanText(text) {
    return (text || '').replace(/[\]\-\s]/g, '').toLowerCase()
}

function parseLyrics() {
    if (elem_lyricsInput.value.trim() === '') return

    elem_lyricsContent.innerHTML = ''

    // Per-key array so duplicate lines each restore their own timing in order
    const oldLineMap = new Map()
    tempLyrics.forEach(oldLine => {
        if (!oldLine.isTaggedLine) {
            const key = cleanText(oldLine.text)
            if (!oldLineMap.has(key)) oldLineMap.set(key, [])
            oldLineMap.get(key).push(oldLine)
        }
    })
    const oldLineConsumed = new Map()

    metadata.songParts = []
    // Each #Tag occurrence gets its own songParts entry — duplicates are intentional (grouping, not type)
    function addSongPart(tagName) {
        const idx = metadata.songParts.length
        metadata.songParts.push({ name: tagName, time: 0, duration: 0 })
        return idx
    }

    const newLyrics = []
    const lines = (elem_lyricsInput.value + '\n#ENDOFLINE').split('\n')
    let lineDisplayIdx = 0
    let currentTag = ''
    let currentSongPartIndex = -1

    lines.forEach((line, lineIndex) => {
        const trimmed = line.trim()
        const isSongPartTag = isValidTag(trimmed)
        const agentDecl = extractAgentDeclaration(trimmed)

        const p = document.createElement('p')
        p.classList.add('lyrics-line')
        p.classList.add(lineDisplayIdx % 2 === 0 ? 'even' : 'odd')

        if (agentDecl) {
            metadata.agents[agentDecl.alias] = {
                type: agentDecl.type,
                name: agentDecl.name,
                alias: agentDecl.alias
            }

            p.classList.add('tagged-line')
            const span = document.createElement('span')
            span.classList.add('lyrics-word')
            span.innerText = trimmed
            span.id = 'line-tag-' + lineIndex
            p.appendChild(span)
            newLyrics.push({
                time: 0, duration: 0, text: trimmed, syllabus: [],
                element: { key: 'tag-' + lineIndex, singer: null, songPartIndex: currentSongPartIndex },
                isTaggedLine: true, tag: null, lineIndex: lineIndex, lineElement: p
            })
            elem_lyricsContent.appendChild(p)
            return
        }

        if (isSongPartTag) {
            currentTag = extractTagName(trimmed)
            if (currentTag !== 'ENDOFLINE') {
                currentSongPartIndex = addSongPart(currentTag)
            }
            p.classList.add('tagged-line')
            const span = document.createElement('span')
            span.classList.add('lyrics-word')
            span.innerText = trimmed
            span.id = 'line-tag-' + lineIndex
            p.appendChild(span)
            newLyrics.push({
                time: 0, duration: 0, text: trimmed, syllabus: [],
                element: { key: 'tag-' + lineIndex, singer: null, songPartIndex: currentSongPartIndex },
                isTaggedLine: true, tag: currentTag, lineIndex: lineIndex, lineElement: p
            })
            elem_lyricsContent.appendChild(p)
            return
        }

        let lineSinger = 'v1'
        let actualLineText = line

        const sortedAliases = Object.keys(metadata.agents).sort((a, b) => b.length - a.length)
        for (const alias of sortedAliases) {
            if (actualLineText.trim().startsWith(alias + ':')) {
                lineSinger = alias
                const prefixMatch = actualLineText.match(new RegExp(`^\\s*${alias}:`))
                if (prefixMatch) {
                    actualLineText = actualLineText.substring(prefixMatch[0].length)
                }
                break
            }
        }

        const words = splitTextWithSeparators(actualLineText)
        const syllabus = words.map(w => ({ time: 0, duration: 0, text: w, isDone: false, element: null }))

        // Consume old timing in order so duplicate lines don't steal each other's timing
        const _key = cleanText(actualLineText)
        const _pool = oldLineMap.get(_key)
        const _consumed = oldLineConsumed.get(_key) || 0
        const oldLine = _pool ? _pool[_consumed] : null
        if (_pool && _consumed < _pool.length) oldLineConsumed.set(_key, _consumed + 1)
        if (oldLine && oldLine.syllabus) {
            oldLine.syllabus.forEach((oldSyl, si) => {
                if (si < syllabus.length && oldSyl.isDone) {
                    syllabus[si].time = oldSyl.time
                    syllabus[si].duration = oldSyl.duration
                    syllabus[si].isDone = oldSyl.isDone
                }
            })
        }

        const lineText = words.join('')
        const lineTime = syllabus.find(s => s.isDone)?.time || 0
        const lastSyl = [...syllabus].reverse().find(s => s.isDone)
        const lineDur = lastSyl ? (lastSyl.time + lastSyl.duration - lineTime) : 0

        syllabus.forEach((syl, si) => {
            const span = document.createElement('span')
            span.classList.add('lyrics-word')
            span.innerText = syl.text.replace(/]/g, '')
            span.id = 'syl-' + lineIndex + '-' + si
            if (syl.text.trim() === '') span.classList.add('lyrics-space')
            if (isRTL(syl.text)) span.classList.add('rtl-word')
            if (syl.isDone) {
                span.classList.add('done-word')
                span.style.setProperty('--duration', syl.duration + 'ms')
            }
            syl.element = span
            p.appendChild(span)
        })

        newLyrics.push({
            time: lineTime, duration: lineDur, text: lineText, syllabus: syllabus,
            element: { key: 'L' + lineIndex, singer: lineSinger, songPartIndex: currentSongPartIndex },
            isTaggedLine: false, tag: null, lineIndex: lineIndex, lineElement: p
        })
        elem_lyricsContent.appendChild(p)
        lineDisplayIdx++
    })

    tempLyrics = newLyrics
    buildAllSyllables()
    _seekToFirstUnsynced()
}

function nextWord() {
    const NextWordButton = document.getElementById('nextword-button')
    if (NextWordButton) {
        NextWordButton.classList.add('enabled')
        setTimeout(() => { NextWordButton.classList.remove('enabled') }, 50)
    }

    if (allSyllables.length === 0 || currentWordIndex >= allSyllables.length) return

    const time = player.currentTime * 1000
    const entry = allSyllables[currentWordIndex]

    // Virtual ENDOFLINE entry — seals the last syllable's duration then exits
    if (entry.isEndOfLine) {
        if (currentWordIndex > 0) {
            const prev = allSyllables[currentWordIndex - 1]
            const prevSyl = tempLyrics[prev.lineIdx]?.syllabus[prev.syllabusIdx]
            if (prevSyl && prevSyl.time > 0) {
                prevSyl.duration = Math.max(0, time - prevSyl.time)
                if (prevSyl.element) {
                    prevSyl.element.style.setProperty('--duration', prevSyl.duration + 'ms')
                    prevSyl.element.classList.add('done-word')
                    prevSyl.element.classList.remove('current-word')
                }
                const prevLine = tempLyrics[prev.lineIdx]
                if (prevLine) {
                    const lastLineSyl = prevLine.syllabus[prevLine.syllabus.length - 1]
                    prevLine.duration = (lastLineSyl.time + lastLineSyl.duration) - prevLine.time
                }
            }
        }
        currentWordIndex++
        return
    }

    const { lineIdx, syllabusIdx } = entry
    const line = tempLyrics[lineIdx]
    if (!line) return
    const syl = line.syllabus[syllabusIdx]
    if (!syl) return

    if (currentWordIndex > 0) {
        const prev = allSyllables[currentWordIndex - 1]
        if (!prev.isEndOfLine) {
            const prevSyl = tempLyrics[prev.lineIdx]?.syllabus[prev.syllabusIdx]
            if (prevSyl && prevSyl.time > 0) {
                prevSyl.duration = Math.max(0, time - prevSyl.time)
                if (prevSyl.element) {
                    prevSyl.element.style.setProperty('--duration', prevSyl.duration + 'ms')
                    prevSyl.element.classList.add('done-word')
                    prevSyl.element.classList.remove('current-word')
                }
            }
        }
    }

    syl.time = time
    syl.isDone = true
    syl.duration = 0

    if (syllabusIdx === 0) line.time = time
    const lastSyl = line.syllabus[line.syllabus.length - 1]
    if (lastSyl.time > 0) {
        line.duration = (lastSyl.time + lastSyl.duration) - line.time
    }

    if (syl.element) {
        const prevCurrent = document.querySelector('.current-word')
        if (prevCurrent) prevCurrent.classList.remove('current-word')
        syl.element.classList.add('current-word', 'playing-word')
        elem_lyricsContent.scrollTop = syl.element.offsetTop - elem_lyricsContent.offsetTop - 100
    }

    lastWordIndex = currentWordIndex
    currentWordIndex++
}

function openWord(wordIndex) {
    if (wordIndex < 0 || wordIndex >= allSyllables.length) return
    const { lineIdx, syllabusIdx } = allSyllables[wordIndex]
    const line = tempLyrics[lineIdx]
    if (!line) return
    const syl = line.syllabus[syllabusIdx]
    if (!syl) return

    currentWordIndex = wordIndex
    selectedWordIndex = wordIndex

    document.querySelectorAll('.opened-word').forEach(el => el.classList.remove('opened-word'))
    if (syl.element) syl.element.classList.add('opened-word')

    document.getElementById('properties-word').innerText = syl.text || ''
    document.getElementById('properties-start').value = syl.time || 0
    document.getElementById('properties-length').value = syl.duration || 0
    player.currentTime = (syl.time || 0) / 1000
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

function playPause() {
    const playPauseButton = document.getElementById('playpause-button')
    if (playPauseButton) {
        playPauseButton.classList.add('enabled')
        setTimeout(() => { playPauseButton.classList.remove('enabled') }, 50)
    }
    if (player.paused) { player.play() } else { player.pause() }
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

function prepareNewKpoeJSON(cleanTiming = true) {
    if (!tempLyrics || tempLyrics.length === 0) return new Blob(['{}'], { type: 'application/json' })

    // Recompute songParts time/duration from first/last synced line of each section
    const partFirstTime = {}
    const partLastEnd = {}
    tempLyrics.forEach(line => {
        if (line.isTaggedLine || !line.time) return
        const pi = line.element?.songPartIndex
        if (pi == null || pi < 0) return
        if (partFirstTime[pi] == null || line.time < partFirstTime[pi]) partFirstTime[pi] = line.time
        const end = line.time + line.duration
        if (partLastEnd[pi] == null || end > partLastEnd[pi]) partLastEnd[pi] = end
    })
    metadata.songParts.forEach((part, i) => {
        if (partFirstTime[i] != null) {
            part.time = partFirstTime[i]
            part.duration = (partLastEnd[i] || part.time) - part.time
        }
    })

    // Use actual audio duration
    const durMs = (player.duration || 0) * 1000
    const tMin = Math.floor(durMs / 60000)
    const tSec = ((durMs % 60000) / 1000).toFixed(3)
    metadata.totalDuration = tMin + ':' + String(tSec).padStart(6, '0')

    const exportedLyrics = tempLyrics
        .filter(l => !l.isTaggedLine)
        .map(line => ({
            time: Math.round(line.time || 0),
            duration: Math.round(line.duration || 0),
            text: (line.text || '').replace(/\]/g, ''),
            syllabus: (line.syllabus || [])
                .filter(s => !cleanTiming || (s.text || '').replace(/\]/g, '').trim() !== '')
                .map(s => ({
                    time: Math.round(s.time || 0),
                    duration: Math.round(s.duration || 0),
                    text: (s.text || '').replace(/\]/g, '')
                })),
            element: {
                key: line.element?.key || '',
                singer: line.element?.singer || 'v1',
                songPartIndex: line.element?.songPartIndex ?? -1
            }
        }))

    return new Blob([JSON.stringify({
        KpoeTools: AppVersion.version,
        type: 'Word',
        metadata: {
            source: metadata.source,
            songWriters: metadata.songWriters,
            title: metadata.title,
            language: metadata.language,
            agents: metadata.agents,
            songParts: metadata.songParts,
            totalDuration: metadata.totalDuration
        },
        lyrics: exportedLyrics
    }, null, 4)], { type: 'application/json' })
}

function prepareLegacyJSON(cleanTiming = true) {
    if (!tempLyrics || tempLyrics.length === 0) return new Blob(['{}'], { type: 'application/json' })

    const durMs = (player.duration || 0) * 1000
    const tMin = Math.floor(durMs / 60000)
    const tSec = ((durMs % 60000) / 1000).toFixed(3)
    metadata.totalDuration = tMin + ':' + String(tSec).padStart(6, '0')

    const exportedWords = []
    tempLyrics.forEach(line => {
        if (line.isTaggedLine) return
        const syllabus = line.syllabus || []
        const partIdx = line.element?.songPartIndex ?? -1
        const partName = (partIdx >= 0 && metadata.songParts[partIdx]) ? metadata.songParts[partIdx].name : null
        const singer = line.element?.singer || 'v1'
        const key = line.element?.key || ''
        syllabus.forEach((syl, si) => {
            const cleanedText = (syl.text || '').replace(/\]/g, '').trim()
            if (cleanTiming && cleanedText === '') return  // skip whitespace / empty syllables
            exportedWords.push({
                time: Math.round(syl.time || 0),
                duration: Math.round(syl.duration || 0),
                text: (syl.text || '').replace(/\]/g, ''),
                isLineEnding: si === syllabus.length - 1 ? 1 : 0,
                element: { key, songPart: partName, singer }
            })
        })
    })

    const plainText = elem_lyricsInput.value !== '' ? elem_lyricsInput.value : undefined
    return new Blob([JSON.stringify({
        type: 'Word', KpoeTools: AppVersion.version,
        metadata, lyrics: exportedWords, plainText, isNotRaw: true
    }, null, 4)], { type: 'application/json' })
}

function prepareJSON(cleanTiming = true) {
    return prepareLegacyJSON(cleanTiming)
}

function prepareLRC() {
    if (!tempLyrics || tempLyrics.length === 0) return new Blob([''], { type: 'text/plain' })

    let lrcContent = ''
    tempLyrics.forEach(line => {
        if (!line || line.isTaggedLine) return
        const syllabus = line.syllabus || []
        if (!syllabus.length) return
        const lineTime = line.time || syllabus[0].time || 0
        const lineText = syllabus.map(s => s.text).join('').trim()
        lrcContent += '[' + msToTime(lineTime) + ']' + lineText + '\n'
    })
    return new Blob([lrcContent.trim()], { type: 'text/plain' })
}

function prepareELRC() {
    if (!tempLyrics || tempLyrics.length === 0) return new Blob([''], { type: 'text/plain' })

    let lrcContent = ''
    tempLyrics.forEach(line => {
        if (!line || line.isTaggedLine) return
        const syllabus = line.syllabus || []
        if (!syllabus.length) return
        let first = true
        syllabus.forEach(syl => {
            if (first) {
                lrcContent += '\n[' + msToTime(syl.time || 0) + ']' + (syl.text || '')
                first = false
            } else {
                lrcContent += ' <' + msToTime(syl.time || 0) + '>' + (syl.text || '')
            }
        })
    })
    return new Blob([lrcContent.trim()], { type: 'text/plain' })
}

function exportNewKpoeJSON() {
    downloadBlob(prepareNewKpoeJSON())
}

function exportLegacyJSON() {
    downloadBlob(prepareLegacyJSON())
}

function exportJSON() {
    exportNewKpoeJSON()
}

function exportLRC() {
    downloadBlob(prepareLRC(), 'lrc')
}

function exportELRC() {
    downloadBlob(prepareELRC(), 'lrc')
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
    let jsonLyrics = prepareNewKpoeJSON(false)  // full v2 RAM state, no cleanTiming strip
    zip.file("lyrics.kmakefile", jsonLyrics)

    const options = { type: 'blob', mimeType: 'application/kmake' }
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

document.addEventListener('keydown', function (event) {
    if (document.activeElement === elem_lyricsInput) return
    if (event.keyCode === 13) {
        event.preventDefault()
        nextWord()
    }
})

setInterval(() => {
    if (!tempLyrics || tempLyrics.length === 0) return

    if (player.paused) {
        document.getElementById('lyrics-content').classList.add('paused')
    } else {
        document.getElementById('lyrics-content').classList.remove('paused')
    }

    const time = player.currentTime * 1000

    let currentSylRef = null
    for (let i = 0; i < allSyllables.length; i++) {
        const { lineIdx, syllabusIdx } = allSyllables[i]
        const syl = tempLyrics[lineIdx]?.syllabus[syllabusIdx]
        if (!syl || !syl.isDone) break
        if ((syl.time || 0) > time) {
            if (i > 0) currentSylRef = allSyllables[i - 1]
            break
        }
        currentSylRef = allSyllables[i]
    }

    const playingEl = document.querySelector('.playing-word')
    if (playingEl) playingEl.classList.remove('playing-word')

    let currentSyl = null
    if (currentSylRef) {
        currentSyl = tempLyrics[currentSylRef.lineIdx]?.syllabus[currentSylRef.syllabusIdx]
        if (currentSyl?.element) currentSyl.element.classList.add('playing-word')
    }

    const currentText = currentSyl?.text || ''
    if (currentText === played_word) return
    played_word = currentText

    const allSylElems = Array.from(document.querySelectorAll('.lyrics-word')).filter(el => el.id.startsWith('syl-'))
    const currentElem = currentSyl?.element
    const currentElemIdx = currentElem ? allSylElems.indexOf(currentElem) : -1
    allSylElems.forEach((el, idx) => { el.classList.toggle('past-word', idx < currentElemIdx) })

    document.querySelectorAll('.lyrics-line:not(.tagged-line)').forEach(l => {
        l.classList.remove('playing-line', 'next-playing-line', 'previous-playing-line', 'next-next-playing-line')
    })

    if (!currentSyl?.element) return
    const lyricsLine = currentSyl.element.closest('.lyrics-line')
    if (!lyricsLine || lyricsLine.classList.contains('tagged-line')) return

    function getValidLine(element, direction) {
        let cur = element
        while (cur) {
            cur = direction === 'next' ? cur.nextElementSibling : cur.previousElementSibling
            if (cur && !cur.classList.contains('tagged-line')) return cur
        }
        return null
    }

    lyricsLine.classList.add('playing-line')
    const nextLine = getValidLine(lyricsLine, 'next')
    if (nextLine) {
        nextLine.classList.add('next-playing-line')
        const nextNext = getValidLine(nextLine, 'next')
        if (nextNext) nextNext.classList.add('next-next-playing-line')
    }
    const prevLine = getValidLine(lyricsLine, 'previous')
    if (prevLine) prevLine.classList.add('previous-playing-line')

    if (document.getElementById('lyrics-content').classList.contains('preview')) {
        const lyricsContent = document.getElementById('lyrics-content')
        lyricsContent.scrollTop = lyricsLine.offsetTop - lyricsContent.clientHeight / 2 + 120
    }
}, 1)

elem_musicInput.addEventListener('change', function () {
    const file = this.files[0]
    if (!file) return

    const objectURL = URL.createObjectURL(file)
    player.source = {
        type: 'audio',
        title: 'Local File',
        sources: [{ src: objectURL, type: file.type || 'audio/mp3' }],
    }

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
    if (document.activeElement === elem_lyricsInput) return
    if (event.keyCode === 32) {
        if (document.activeElement.tagName === 'BUTTON' || document.activeElement === elem_musicPlayer) return
        playPause()
        event.preventDefault()
    }
})

document.addEventListener('keydown', function (event) {
    if (document.activeElement === elem_lyricsInput) return

    if (event.keyCode === 37) goBackIndex -= 1
    if (event.keyCode === 39) {
        goBackIndex += 1
        if (goBackIndex > 0) goBackIndex = 0
    }

    if (event.keyCode === 37 || event.keyCode === 39) {
        const targetIndex = currentWordIndex + goBackIndex
        if (targetIndex >= 0 && targetIndex < allSyllables.length) {
            const { lineIdx, syllabusIdx } = allSyllables[targetIndex]
            const syl = tempLyrics[lineIdx]?.syllabus[syllabusIdx]
            if (syl && syl.time !== undefined) player.currentTime = syl.time / 1000
        }
    }
})

document.addEventListener('click', function (event) {
    if (event.target.classList.contains('lyrics-word')) {
        const el = event.target
        // Syllable spans use id format: syl-{lineIdx}-{syllabusIdx}
        if (el.id && el.id.startsWith('syl-')) {
            const parts = el.id.split('-')
            const li = parseInt(parts[1])
            const si = parseInt(parts[2])
            const idx = allSyllables.findIndex(a => a.lineIdx === li && a.syllabusIdx === si)
            if (idx !== -1) openWord(idx)
        }
    }
})

document.getElementById('properties-start')?.addEventListener('change', function (event) {
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const { lineIdx, syllabusIdx } = allSyllables[selectedWordIndex]
    const syl = tempLyrics[lineIdx]?.syllabus[syllabusIdx]
    if (!syl) return
    syl.time = Math.max(0, parseInt(event.target.value) || 0)
})

document.getElementById('properties-length')?.addEventListener('change', function (event) {
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const { lineIdx, syllabusIdx } = allSyllables[selectedWordIndex]
    const syl = tempLyrics[lineIdx]?.syllabus[syllabusIdx]
    if (!syl) return
    syl.duration = Math.max(0, parseInt(event.target.value) || 0)
    if (syl.element) syl.element.style.setProperty('--duration', syl.duration + 'ms')
})

document.getElementById('properties-preview')?.addEventListener('click', function (event) {
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const { lineIdx, syllabusIdx } = allSyllables[selectedWordIndex]
    const syl = tempLyrics[lineIdx]?.syllabus[syllabusIdx]
    if (!syl) return
    player.currentTime = (syl.time || 0) / 1000
    player.play()
    setTimeout(() => { player.pause() }, syl.duration || 1000)
})

window.addEventListener('load', function () {
    const loadingElement = document.getElementById('loading')
    if (loadingElement) loadingElement.style.display = 'none'
})

if (typeof tippy !== 'undefined') {
    tippy('#file-drop', {
        content: `
            <div id="file-dropdown" class="dropdown-content">
                <button onclick="reset()">New</button>
                <button onclick="importKMAKE()">Open</button>
                <button onclick="exportKMAKE()">Save as</button>
            </div>
            <div id="export-dropdown" class="dropdown-content">
                <button onclick="exportNewKpoeJSON()" id="json-button">Export as JSON</button>
                <button onclick="exportLegacyJSON()" id="legacy-json-button">Export as Just Dance KTAPE</button>
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
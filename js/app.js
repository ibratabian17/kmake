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
    updateTimeDisplays()
    player.currentTime = (syl.time || 0) / 1000

    // Populate line info
    const lineTextEl = document.getElementById('properties-line-text')
    if (lineTextEl) lineTextEl.textContent = (line.text || '').trim() || '(empty line)'

    // Populate agent dropdown for the line
    const agentSel = document.getElementById('properties-line-agent')
    if (agentSel) {
        agentSel.innerHTML = ''
        Object.entries(metadata.agents).forEach(([alias, agent]) => {
            const opt = document.createElement('option')
            opt.value = alias
            opt.textContent = agent.name ? `${alias} — ${agent.name}` : alias
            if (alias === (line.element?.singer || 'v1')) opt.selected = true
            agentSel.appendChild(opt)
        })
    }

    // Show filled state
    const empty = document.getElementById('props-empty')
    const filled = document.getElementById('props-filled')
    if (empty) empty.style.display = 'none'
    if (filled) filled.style.display = 'flex'
}

function unselect() {
    selectedWordIndex = -1
    document.querySelectorAll('.opened-word').forEach(el => el.classList.remove('opened-word'))
    document.getElementById('properties-word').innerText = ''
    document.getElementById('properties-start').value = 0
    document.getElementById('properties-length').value = 0
    updateTimeDisplays()
    const empty = document.getElementById('props-empty')
    const filled = document.getElementById('props-filled')
    if (empty) empty.style.display = 'flex'
    if (filled) filled.style.display = 'none'
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

    // 1. Recompute songParts time/duration from first/last synced line of each section
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

    // 2. Set total duration
    const durMs = (player.duration || 0) * 1000
    const tMin = Math.floor(durMs / 60000)
    const tSec = ((durMs % 60000) / 1000).toFixed(3)
    metadata.totalDuration = tMin + ':' + String(tSec).padStart(6, '0')

    // 3. Process and Clean Lyrics
    const exportedLyrics = tempLyrics
        .filter(l => {
            if (l.isTaggedLine) return false;
            // Skip lines that are empty or just whitespace if cleaning is enabled
            if (cleanTiming && (l.text || '').trim() === '') return false;
            return true;
        })
        .map(line => {
            // Clean and filter syllables first
            const cleanedSyllables = (line.syllabus || [])
                .filter(s => !cleanTiming || (s.text || '').replace(/\]/g, '').trim() !== '')
                .map(s => ({
                    time: Math.round(s.time || 0),
                    duration: Math.round(s.duration || 0),
                    text: (s.text || '').replace(/\]/g, '')
                }));

            let actualLineDuration = Math.round(line.duration || 0);
            if (cleanedSyllables.length > 0) {
                const lastSyllable = cleanedSyllables[cleanedSyllables.length - 1];
                const lineEnd = lastSyllable.time + lastSyllable.duration;
                actualLineDuration = lineEnd - Math.round(line.time || 0);
            }

            // Reconstruct line text from the cleaned syllables to keep them in sync
            const reconstructedText = cleanedSyllables.map(s => s.text).join('');

            return {
                time: Math.round(line.time || 0),
                duration: actualLineDuration,
                text: reconstructedText,
                syllabus: cleanedSyllables,
                element: {
                    key: line.element?.key || '',
                    singer: line.element?.singer || 'v1',
                    songPartIndex: line.element?.songPartIndex ?? -1
                }
            };
        });

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

        // If cleanTiming is on, don't even process lines that are empty
        if (cleanTiming && (line.text || '').trim() === '') return;

        const syllabus = line.syllabus || []
        const partIdx = line.element?.songPartIndex ?? -1
        const partName = (partIdx >= 0 && metadata.songParts[partIdx]) ? metadata.songParts[partIdx].name : null
        const singer = line.element?.singer || 'v1'
        const key = line.element?.key || ''

        // Filter syllables that are just whitespace
        const activeSyllables = syllabus.filter(syl => {
            const cleaned = (syl.text || '').replace(/\]/g, '').trim();
            return !cleanTiming || cleaned !== '';
        });

        activeSyllables.forEach((syl, si) => {
            exportedWords.push({
                time: Math.round(syl.time || 0),
                duration: Math.round(syl.duration || 0),
                text: (syl.text || '').replace(/\]/g, ''),
                isLineEnding: si === activeSyllables.length - 1 ? 1 : 0,
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

document.getElementById('properties-start')?.addEventListener('input', function (event) {
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const { lineIdx, syllabusIdx } = allSyllables[selectedWordIndex]
    const syl = tempLyrics[lineIdx]?.syllabus[syllabusIdx]
    if (!syl) return
    syl.time = Math.max(0, parseInt(event.target.value) || 0)
    updateTimeDisplays()
})

document.getElementById('properties-length')?.addEventListener('input', function (event) {
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const { lineIdx, syllabusIdx } = allSyllables[selectedWordIndex]
    const syl = tempLyrics[lineIdx]?.syllabus[syllabusIdx]
    if (!syl) return
    syl.duration = Math.max(0, parseInt(event.target.value) || 0)
    if (syl.element) syl.element.style.setProperty('--duration', syl.duration + 'ms')
    updateTimeDisplays()
})

document.getElementById('properties-preview')?.addEventListener('click', function (event) {
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const { lineIdx, syllabusIdx } = allSyllables[selectedWordIndex]
    const syl = tempLyrics[lineIdx]?.syllabus[syllabusIdx]
    if (!syl) return
    player.currentTime = (syl.time || 0) / 1000
    player.play()
    setTimeout(() => { player.pause() }, (syl.duration || 1000) + 300)
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
// ============================================================
// PROPERTIES PANEL HELPERS
// ============================================================

function msToDisplayTime(ms) {
    const totalMs = Math.max(0, Math.round(ms))
    const min = Math.floor(totalMs / 60000)
    const sec = Math.floor((totalMs % 60000) / 1000)
    const mill = totalMs % 1000
    return `${min}:${String(sec).padStart(2, '0')}.${String(mill).padStart(3, '0')}`
}

function updateTimeDisplays() {
    const startVal = parseInt(document.getElementById('properties-start')?.value) || 0
    const lengthVal = parseInt(document.getElementById('properties-length')?.value) || 0
    const sd = document.getElementById('props-start-display')
    const ld = document.getElementById('props-length-display')
    if (sd) sd.textContent = msToDisplayTime(startVal)
    if (ld) ld.textContent = msToDisplayTime(lengthVal)
}

function nudgeProperty(field, delta) {
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const { lineIdx, syllabusIdx } = allSyllables[selectedWordIndex]
    const syl = tempLyrics[lineIdx]?.syllabus[syllabusIdx]
    if (!syl) return

    const inputId = field === 'start' ? 'properties-start' : 'properties-length'
    const input = document.getElementById(inputId)
    if (!input) return

    const newVal = Math.max(0, (parseInt(input.value) || 0) + delta)
    input.value = newVal

    if (field === 'start') {
        syl.time = newVal
    } else {
        syl.duration = newVal
        if (syl.element) syl.element.style.setProperty('--duration', syl.duration + 'ms')
    }
    updateTimeDisplays()
}

function syncWordToCursor(field) {
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const { lineIdx, syllabusIdx } = allSyllables[selectedWordIndex]
    const syl = tempLyrics[lineIdx]?.syllabus[syllabusIdx]
    if (!syl) return
    const timeMs = Math.round(player.currentTime * 1000)
    const input = document.getElementById('properties-start')
    if (input) input.value = timeMs
    syl.time = timeMs
    syl.isDone = true
    if (syl.element) syl.element.classList.add('done-word')
    updateTimeDisplays()
    showToast(`Synced to ${msToDisplayTime(timeMs)}`)
}

function changeSelectedLineAgent(newAlias) {
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const { lineIdx } = allSyllables[selectedWordIndex]
    const line = tempLyrics[lineIdx]
    if (!line || !line.element) return
    const oldAlias = line.element.singer || 'v1'
    line.element.singer = newAlias

    // Also update the plaintext textarea to reflect singer change
    const textLines = elem_lyricsInput.value.split('\n')
    let lineCounter = 0
    for (let i = 0; i < textLines.length; i++) {
        const t = textLines[i].trim()
        if (extractAgentDeclaration(t) || isValidTag(t)) continue
        if (lineCounter === line.lineIndex) {
            const prefixRe = new RegExp(`^\\s*${oldAlias}:`)
            if (prefixRe.test(textLines[i])) {
                textLines[i] = textLines[i].replace(prefixRe, newAlias + ':')
            } else {
                textLines[i] = newAlias + ':' + textLines[i]
            }
            break
        }
        lineCounter++
    }
    elem_lyricsInput.value = textLines.join('\n')
    showToast(`Line reassigned to ${newAlias}`)
}

// ============================================================
// AGENT MANAGER
// ============================================================

function openAgentManager() {
    const existing = document.getElementById('agent-manager-modal')
    if (existing) existing.remove()

    const modal = document.createElement('div')
    modal.id = 'agent-manager-modal'
    modal.className = 'kmake-modal'
    modal.innerHTML = `
        <div class="kmake-modal-backdrop" onclick="closeAgentManager()"></div>
        <div class="kmake-modal-content" style="min-width:560px;max-width:700px">
            <div class="kmake-modal-header">
                <i data-lucide="users" class="modal-header-icon"></i>
                <h2>Agent Manager</h2>
                <button onclick="closeAgentManager()" class="modal-close-btn" title="Close"><i data-lucide="x"></i></button>
            </div>
            <div class="kmake-modal-body">
                <p class="modal-hint">Agents are singers or performers. Each gets a short <b>alias</b> (like <code>v1</code>) used in lyrics lines.</p>
                <div id="agent-list" class="agent-list"></div>
                <button onclick="addAgentRow()" class="btn-add-agent"><i data-lucide="plus"></i> Add Agent</button>
            </div>
            <div class="kmake-modal-footer">
                <button onclick="saveAgents()" class="btn-primary">Save & Apply</button>
                <button onclick="closeAgentManager()" class="btn-secondary">Cancel</button>
            </div>
        </div>
    `
    document.body.appendChild(modal)
    renderAgentList()
    requestAnimationFrame(() => { modal.classList.add('visible'); lucide.createIcons() })
}

function renderAgentList() {
    const list = document.getElementById('agent-list')
    if (!list) return
    list.innerHTML = ''
    Object.entries(metadata.agents).forEach(([alias, agent]) => {
        appendAgentRow(list, alias, agent.name || '', agent.type || 'person')
    })
}

function appendAgentRow(list, alias, name, type) {
    const row = document.createElement('div')
    row.className = 'agent-row'
    row.innerHTML = `
        <div class="agent-row-fields">
            <div class="agent-field agent-field-alias">
                <label>Alias <span class="field-hint">(used in lyrics)</span></label>
                <input type="text" class="agent-alias-input" value="${alias}" placeholder="v1" spellcheck="false" />
            </div>
            <div class="agent-field agent-field-name">
                <label>Display Name <span class="field-hint">(optional)</span></label>
                <input type="text" class="agent-name-input" value="${name}" placeholder="Artist Name" />
            </div>
            <div class="agent-field agent-field-type">
                <label>Type</label>
                <select class="agent-type-input">
                    <option value="person" ${type === 'person' ? 'selected' : ''}>Person</option>
                    <option value="group" ${type === 'group' ? 'selected' : ''}>Group</option>
                    <option value="virtual" ${type === 'virtual' ? 'selected' : ''}>Virtual</option>
                    <option value="other" ${type === 'other' ? 'selected' : ''}>Other</option>
                </select>
            </div>
        </div>
        <button class="btn-remove-agent" title="Remove agent" onclick="this.closest('.agent-row').remove()"><i data-lucide="trash-2"></i></button>
    `
    list.appendChild(row)
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [row] })
}

function addAgentRow() {
    const list = document.getElementById('agent-list')
    if (!list) return
    const existingAliases = Array.from(list.querySelectorAll('.agent-alias-input')).map(i => i.value)
    let n = existingAliases.length + 1
    while (existingAliases.includes('v' + n)) n++
    appendAgentRow(list, 'v' + n, '', 'person')
    list.lastElementChild?.querySelector('.agent-alias-input')?.focus()
}

function saveAgents() {
    const rows = document.querySelectorAll('#agent-list .agent-row')
    const newAgents = {}
    let hasError = false

    rows.forEach(row => {
        const alias = row.querySelector('.agent-alias-input').value.trim()
        const name = row.querySelector('.agent-name-input').value.trim()
        const type = row.querySelector('.agent-type-input').value

        if (!alias) { showToast('Alias cannot be empty', 3000, 'error'); hasError = true; return }
        if (newAgents[alias]) { showToast(`Duplicate alias: ${alias}`, 3000, 'error'); hasError = true; return }
        newAgents[alias] = { type, name, alias }
    })

    if (hasError) return

    const oldAliases = new Set(Object.keys(metadata.agents))
    const removedAliases = [...oldAliases].filter(a => !newAgents[a])

    metadata.agents = newAgents
    updateAgentDeclarationsInText()
    closeAgentManager()
    parseLyrics()

    if (removedAliases.length) {
        showToast(`Agents saved — removed: ${removedAliases.join(', ')}`)
    } else {
        showToast('Agents saved')
    }
}

function updateAgentDeclarationsInText() {
    const currentText = elem_lyricsInput.value
    const lines = currentText.split('\n')
    const nonAgentLines = lines.filter(l => !extractAgentDeclaration(l.trim()))

    const agentDecls = Object.values(metadata.agents).map(agent =>
        agent.name
            ? `[agent:${agent.type}=${agent.alias}:${agent.name}]`
            : `[agent:${agent.type}=${agent.alias}]`
    )

    // Drop leading empty lines from content before rejoining
    let contentStart = 0
    while (contentStart < nonAgentLines.length && nonAgentLines[contentStart].trim() === '') contentStart++

    elem_lyricsInput.value = [...agentDecls, '', ...nonAgentLines.slice(contentStart)].join('\n')
}

function closeAgentManager() {
    const modal = document.getElementById('agent-manager-modal')
    if (!modal) return
    modal.classList.remove('visible')
    setTimeout(() => modal.remove(), 200)
}

// ============================================================
// METADATA EDITOR
// ============================================================

function openMetadataEditor() {
    const existing = document.getElementById('metadata-modal')
    if (existing) existing.remove()

    const modal = document.createElement('div')
    modal.id = 'metadata-modal'
    modal.className = 'kmake-modal'
    modal.innerHTML = `
        <div class="kmake-modal-backdrop" onclick="closeMetadataEditor()"></div>
        <div class="kmake-modal-content" style="max-width:500px">
            <div class="kmake-modal-header">
                <i data-lucide="music" class="modal-header-icon"></i>
                <h2>Song Metadata</h2>
                <button onclick="closeMetadataEditor()" class="modal-close-btn"><i data-lucide="x"></i></button>
            </div>
            <div class="kmake-modal-body">

                <div class="meta-group-label">Song Info</div>
                <div class="meta-field">
                    <label>Title</label>
                    <input type="text" id="meta-title" value="${escapeHtmlAttr(metadata.title)}" placeholder="Song title" />
                </div>
                <div class="meta-row">
                    <div class="meta-field">
                        <label>Artist</label>
                        <input type="text" id="meta-artist" value="${escapeHtmlAttr(metadata.artist || '')}" placeholder="Main artist" />
                    </div>
                    <div class="meta-field">
                        <label>Album</label>
                        <input type="text" id="meta-album" value="${escapeHtmlAttr(metadata.album || '')}" placeholder="Album name" />
                    </div>
                </div>
                <div class="meta-field">
                    <label>Songwriters <span class="meta-field-hint">comma-separated</span></label>
                    <input type="text" id="meta-writers" value="${escapeHtmlAttr((metadata.songWriters || []).join(', '))}" placeholder="Writer 1, Writer 2" />
                </div>

                <div class="meta-divider"></div>
                <div class="meta-group-label">Optional</div>

                <div class="meta-row">
                    <div class="meta-field">
                        <label>Language</label>
                        <input type="text" id="meta-language" value="${escapeHtmlAttr(metadata.language || '')}" placeholder="en, ja, ko…" />
                    </div>
                    <div class="meta-field">
                        <label>ISRC</label>
                        <input type="text" id="meta-isrc" value="${escapeHtmlAttr(metadata.isrc || '')}" placeholder="ISRC code" />
                    </div>
                </div>
                <div class="meta-field">
                    <label>Curator</label>
                    <input type="text" id="meta-curator" value="${escapeHtmlAttr(metadata.curator || 'Kmake')}" placeholder="Kmake" />
                </div>
            </div>
            <div class="kmake-modal-footer">
                <button onclick="saveMetadata()" class="btn-primary">Save</button>
                <button onclick="closeMetadataEditor()" class="btn-secondary">Cancel</button>
            </div>
        </div>
    `
    document.body.appendChild(modal)
    requestAnimationFrame(() => { modal.classList.add('visible'); lucide.createIcons() })
}

function saveMetadata() {
    metadata.title = document.getElementById('meta-title').value.trim()
    metadata.artist = document.getElementById('meta-artist').value.trim()
    metadata.album = document.getElementById('meta-album').value.trim()
    metadata.language = document.getElementById('meta-language').value.trim()
    metadata.isrc = document.getElementById('meta-isrc').value.trim()
    metadata.curator = document.getElementById('meta-curator').value.trim() || 'Kmake'
    const writersRaw = document.getElementById('meta-writers').value.trim()
    metadata.songWriters = writersRaw ? writersRaw.split(',').map(s => s.trim()).filter(Boolean) : []
    closeMetadataEditor()
    showToast('Metadata saved')
}

function closeMetadataEditor() {
    const modal = document.getElementById('metadata-modal')
    if (!modal) return
    modal.classList.remove('visible')
    setTimeout(() => modal.remove(), 200)
}

function escapeHtmlAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ============================================================
// PLAIN TEXT TUTORIAL
// ============================================================

function openTutorial() {
    const existing = document.getElementById('tutorial-modal')
    if (existing) existing.remove()

    const modal = document.createElement('div')
    modal.id = 'tutorial-modal'
    modal.className = 'kmake-modal'
    modal.innerHTML = `
        <div class="kmake-modal-backdrop" onclick="closeTutorial()"></div>
        <div class="kmake-modal-content tutorial-content">
            <div class="kmake-modal-header">
                <i data-lucide="book-open" class="modal-header-icon"></i>
                <h2>How to use Kmake</h2>
                <button onclick="closeTutorial()" class="modal-close-btn"><i data-lucide="x"></i></button>
            </div>
            <div class="kmake-modal-body tutorial-body">

                <div class="tutorial-tabs">
                    <button class="tutorial-tab active" onclick="switchTutorialTab(this, 'tab-workflow')">Workflow</button>
                    <button class="tutorial-tab" onclick="switchTutorialTab(this, 'tab-syntax')">Lyrics Syntax</button>
                    <button class="tutorial-tab" onclick="switchTutorialTab(this, 'tab-shortcuts')">Shortcuts</button>
                </div>

                <div id="tab-workflow" class="tutorial-tab-panel active">
                    <div class="tutorial-step">
                        <div class="step-num">1</div>
                        <div class="step-body">
                            <b>Load Music</b>
                            <p>Click <kbd>Music → Load From File</kbd> to import an audio file, or use <kbd>Load From YouTube</kbd> for a YouTube link.</p>
                        </div>
                    </div>
                    <div class="tutorial-step">
                        <div class="step-num">2</div>
                        <div class="step-body">
                            <b>Enter Lyrics</b>
                            <p>Type or paste your lyrics in the <b>Lyrics</b> panel. Use the <b>Syntax</b> tab to learn formatting. Click <kbd>Parse</kbd> to preview.</p>
                        </div>
                    </div>
                    <div class="tutorial-step">
                        <div class="step-num">3</div>
                        <div class="step-body">
                            <b>Set Up Agents (Singers)</b>
                            <p>Click <kbd>Agents</kbd> in the header to add or edit singers. Each singer needs an alias like <code>v1</code>.</p>
                        </div>
                    </div>
                    <div class="tutorial-step">
                        <div class="step-num">4</div>
                        <div class="step-body">
                            <b>Sync Words</b>
                            <p>Press <kbd>Space</kbd> to play, then press <kbd>Enter</kbd> on each word/syllable as it's sung. The word turns green when active.</p>
                        </div>
                    </div>
                    <div class="tutorial-step">
                        <div class="step-num">5</div>
                        <div class="step-body">
                            <b>Export</b>
                            <p>Go to <kbd>File → Export</kbd> to save as JSON, LRC, eLRC, or the native <code>.kmake</code> format.</p>
                        </div>
                    </div>
                </div>

                <div id="tab-syntax" class="tutorial-tab-panel">
                    <div class="syntax-section">
                        <h3>Basic Lyrics</h3>
                        <p>Each line of text becomes one lyric line:</p>
                        <div class="code-block">Hello world
This is the second line</div>
                    </div>
                    <div class="syntax-section">
                        <h3>Declare Agents</h3>
                        <p>Add at the top of your lyrics. Format: <code>[agent:TYPE=ALIAS:Name]</code></p>
                        <div class="code-block">[agent:person=v1:Taylor Swift]
[agent:group=v2:The Band]
[agent:virtual=v3]</div>
                        <p>Types: <code>person</code> &nbsp;|&nbsp; <code>group</code> &nbsp;|&nbsp; <code>virtual</code> &nbsp;|&nbsp; <code>other</code></p>
                        <p class="tip">Use the <b>Agents</b> button to manage this visually instead of typing!</p>
                    </div>
                    <div class="syntax-section">
                        <h3>Assign Lines to Singers</h3>
                        <p>Prefix lines with <code>alias:</code></p>
                        <div class="code-block">v1:This line is sung by singer 1
v2:This line is sung by singer 2
v1:Back to singer 1</div>
                    </div>
                    <div class="syntax-section">
                        <h3>Song Sections</h3>
                        <p>Mark sections with <code>#</code>:</p>
                        <div class="code-block">#Verse 1
v1:First verse line here

#Chorus
v1:Chorus line here</div>
                    </div>
                    <div class="syntax-section">
                        <h3>Syllable Splitting</h3>
                        <p>Use <code>]</code> or <code>-</code> to split words into individually-timed syllables:</p>
                        <div class="code-block">v1:Beau]ti]ful
v1:A-ma-zing</div>
                    </div>
                    <div class="syntax-section">
                        <h3>Full Example</h3>
                        <div class="code-block">[agent:person=v1:Alice]
[agent:person=v2:Bob]

#Verse 1
v1:Hel]lo world, it's me
v2:And I am here with you

#Chorus
v1:We sing to]ge]ther
v2:Be]neath the stars</div>
                    </div>
                </div>

                <div id="tab-shortcuts" class="tutorial-tab-panel">
                    <div class="shortcut-group">
                        <h3>Syncing</h3>
                        <div class="shortcut-list">
                            <div class="shortcut-row"><kbd>Enter</kbd><span>Stamp next word (sync)</span></div>
                            <div class="shortcut-row"><kbd>Space</kbd><span>Play / Pause music</span></div>
                            <div class="shortcut-row"><kbd>←</kbd><span>Seek to previous word</span></div>
                            <div class="shortcut-row"><kbd>→</kbd><span>Seek to next word</span></div>
                        </div>
                    </div>
                    <div class="shortcut-group">
                        <h3>Tips</h3>
                        <ul class="tip-list">
                            <li>Click any word in the Sync panel to <b>select</b> it and edit its timing in the Properties panel.</li>
                            <li>Enable <b>Preview Mode</b> to see a karaoke-style view with themes.</li>
                            <li>Use <b>File → Save as</b> to save a <code>.kmake</code> file (audio + lyrics bundled).</li>
                            <li>Drag panel titles to rearrange the layout.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `
    document.body.appendChild(modal)
    requestAnimationFrame(() => { modal.classList.add('visible'); lucide.createIcons() })
}

function switchTutorialTab(btn, tabId) {
    document.querySelectorAll('.tutorial-tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.tutorial-tab-panel').forEach(p => p.classList.remove('active'))
    btn.classList.add('active')
    const panel = document.getElementById(tabId)
    if (panel) panel.classList.add('active')
}

function closeTutorial() {
    const modal = document.getElementById('tutorial-modal')
    if (!modal) return
    modal.classList.remove('visible')
    setTimeout(() => modal.remove(), 200)
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function showToast(message, duration = 3000, type = 'default') {
    const existing = document.getElementById('kmake-toast')
    if (existing) existing.remove()

    const toast = document.createElement('div')
    toast.id = 'kmake-toast'
    toast.className = `kmake-toast kmake-toast-${type}`
    toast.textContent = message
    document.body.appendChild(toast)

    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('visible'))
    })

    setTimeout(() => {
        toast.classList.remove('visible')
        setTimeout(() => toast.remove(), 300)
    }, duration)
}

// ============================================================
// KEYBOARD SHORTCUT HELP BADGE (shown on first visit)
// ============================================================

(function initHints() {
    const dismissed = localStorage.getItem('kmake-hint-dismissed')
    if (dismissed) return

    const hint = document.createElement('div')
    hint.id = 'kmake-hint-badge'
    hint.className = 'kmake-hint-badge'
    hint.innerHTML = `<i data-lucide="lightbulb" style="width:14px;height:14px;flex-shrink:0"></i><span>New here? Click <b>Help</b> for a guide</span><button onclick="document.getElementById('kmake-hint-badge').remove();localStorage.setItem('kmake-hint-dismissed','1')"><i data-lucide="x" style="width:12px;height:12px"></i></button>`
    document.addEventListener('DOMContentLoaded', () => {
        const header = document.querySelector('.buttons-actions')
        if (header) header.after(hint)
        else document.body.appendChild(hint)
        if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [hint] })
    })
    setTimeout(() => {
        const el = document.getElementById('kmake-hint-badge')
        if (el) { el.classList.add('fade-out'); setTimeout(() => el?.remove(), 400) }
        localStorage.setItem('kmake-hint-dismissed', '1')
    }, 8000)
})()

// ============================================================
// AGENT USAGE HIGHLIGHT IN LYRICS TEXTAREA
// ============================================================

elem_lyricsInput.addEventListener('input', function () {
    // Dynamically extract & keep metadata.agents in sync for prefix auto-detect
    const lines = this.value.split('\n')
    const detectedAgents = {}
    lines.forEach(l => {
        const d = extractAgentDeclaration(l.trim())
        if (d) detectedAgents[d.alias] = { type: d.type, name: d.name, alias: d.alias }
    })
    if (Object.keys(detectedAgents).length > 0) {
        // Merge without overwriting existing agents
        Object.assign(metadata.agents, detectedAgents)
    }
})
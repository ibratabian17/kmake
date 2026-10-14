const jsmediatags = window.jsmediatags

function getSavedCurator() {
    try {
        return localStorage.getItem('kmake_curator') || 'Kmake'
    } catch (e) {
        return 'Kmake'
    }
}

function saveCurator(val) {
    try {
        const clean = (val || '').trim() || 'Kmake'
        localStorage.setItem('kmake_curator', clean)
    } catch (e) {
        console.warn('Could not save curator to localStorage', e)
    }
}

let currentLyrics = []
let tempLyrics = [] // Includes tagged section/agent entries alongside lyric lines.
let allSyllables = [] // Flat cursor of { lineIdx, syllabusIdx }, excluding tagged lines.
let currentWordIndex = 0
let lastWordIndex = 0
let goBackIndex = 0
let importedJSON = false
let filename = ''
let selectedWordIndex = -1
let played_word = ''
let lastPlayedSylId = ''
let music_file = null
let isVisible = false
let _userExplicitWordSelect = false
let _enterDownAt = 0
let _enterHeld = false
let undoStack = []
let redoStack = []
let _isRestoringHistory = false
let lyricsRendererInstance = null
let currentDisplayMode = 'none'
let centerMode = 'sync'
let tlZoom = 110
let tlFollow = true
let tlSnap = true
let tlRipple = false
let audioPeaks = null
let audioDurationSec = 0
let currentYoutubeId = ''
let currentProjectId = 'proj_' + Date.now()
let metadata = {
    source: "",
    title: "",
    language: "",
    songWriters: [],
    agents: { "v1": { type: "person", name: "", alias: "v1" } },
    songParts: [],
    totalDuration: "",
    curator: getSavedCurator()
}
const AppVersion = {
    version: '3.0.0',
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

function toggleMusicPlayer() {
    if (isVisible) {
        elem_navbar.setAttribute('visible', 'false')
        isVisible = false
    } else {
        elem_navbar.setAttribute('visible', 'true')
        isVisible = true
    }
}
window.toggleMusicPlayer = toggleMusicPlayer
if (elem_showMenu) elem_showMenu.onclick = toggleMusicPlayer

for (let i = 0; i < elem_part_sortable.length; i++) {
    Sortable.create(elem_part_sortable[i], {
        group: "part-sortable-" + i,
        handle: ".inner-part-title",
        animation: 150,
        filter: ".ignore-elements",
        ghostClass: "inner-part-ghost",
        chosenClass: "inner-part-chosen",
        dragClass: "inner-part-drag",
        store: {
            set: function (sortable) {
                var order = sortable.toArray()
                try { localStorage.setItem(sortable.options.group.name, order.join('|')) } catch (e) {}
            },
            get: function (sortable) {
                var order = null; try { order = localStorage.getItem(sortable.options.group.name) } catch (e) {}
                return order ? order.split('|') : []
            }
        }
    })
}

function msToTime(duration) {
    const total = Math.max(0, Math.round(duration || 0))
    let milliseconds = Math.floor((total % 1000) / 10)
    let seconds = Math.floor((total / 1000) % 60)
    let minutes = Math.floor((total / (1000 * 60)) % 60)

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

    const separatorRegex = /(\]\]|\]|-)/
    const parts = text.split(separatorRegex)
    const words = []

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i]

        if (part === ']]') {
            if (words.length > 0 && !words[words.length - 1].endsWith(']') && !words[words.length - 1].endsWith('-')) {
                words[words.length - 1] += ']'
            }
            if (typeof editorSettings !== 'undefined' && editorSettings.allowSpaceDoubleBracketEndWord) {
                words.push(']')
            }
        } else if (part === ']' || part === '-') {
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
                    if (typeof editorSettings !== 'undefined' && editorSettings.allowSpaceDoubleBracketEndWord) {
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
                    } else {
                        if (words.length > 0) {
                            words[words.length - 1] += ' '
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

function reset(isNewProject = false) {
    if (!isNewProject && typeof editorSettings !== 'undefined' && editorSettings.confirmReset) {
        const hasWork = (tempLyrics && tempLyrics.some(l => l && !l.isTaggedLine && (l.text || '').trim())) ||
            (elem_lyricsInput && elem_lyricsInput.value.trim() !== '') ||
            Boolean(music_file || currentYoutubeId)
        if (hasWork) {
            const confirmed = window.confirm('Are you sure you want to reset the editor? Your active project in the Projects list will be preserved.')
            if (!confirmed) return false
            saveCurrentProjectToStorage()
        }
    }

    currentLyrics = []
    tempLyrics = []
    allSyllables = []
    currentWordIndex = 0
    lastWordIndex = 0
    goBackIndex = 0
    importedJSON = false
    filename = ''
    selectedWordIndex = -1
    if (typeof selectedWordIndices !== 'undefined' && selectedWordIndices && selectedWordIndices.clear) {
        selectedWordIndices.clear()
    }
    played_word = ''
    lastPlayedSylId = ''
    metadataEverOpened = false
    _pendingExportFn = null
    hasUnsavedChanges = false
    undoStack = []
    redoStack = []

    if (typeof _autoSaveTimer !== 'undefined' && _autoSaveTimer) {
        clearTimeout(_autoSaveTimer)
        _autoSaveTimer = null
    }

    music_file = null
    currentYoutubeId = ''
    audioPeaks = null
    audioDurationSec = 0

    // Always allocate a fresh project ID so reset state never overwrites an existing project
    currentProjectId = 'proj_' + Date.now()

    metadata = {
        source: "",
        title: "",
        language: "",
        songWriters: [],
        agents: { "v1": { type: "person", name: "", alias: "v1" } },
        songParts: [],
        totalDuration: "",
        curator: getSavedCurator()
    }

    if (player) {
        try { player.stop() } catch (e) {}
        player.source = { type: 'audio', sources: [] }
    }

    if (elem_musicInput) elem_musicInput.value = ''
    if (elem_lyricsInput) elem_lyricsInput.value = ''
    if (elem_lyricsContent) elem_lyricsContent.innerHTML = ''

    const t = document.getElementById('music-title')
    const a = document.getElementById('music-artist')
    const al = document.getElementById('music-album')
    const art = document.getElementById('music-album-art')
    if (t) t.innerText = ''
    if (a) a.innerText = ''
    if (al) al.innerText = ''
    if (art) art.src = ''

    unselect()
    rebuildLyricsDOM()
    renderTimeline()
    _updatePreviewSongCard()
    if (typeof isPreviewActive === 'function' && isPreviewActive() && typeof refreshLyricsPlusPreview === 'function') {
        refreshLyricsPlusPreview()
    }
    return true
}

function createNewProject(force = false) {
    const rawInputText = elem_lyricsInput ? elem_lyricsInput.value : ''
    const lyricLines = tempLyrics.filter(l => l && !l.isTaggedLine && (l.text || '').trim())
    const hasAudio = Boolean(music_file || currentYoutubeId)
    const hasContent = lyricLines.length > 0 || rawInputText.trim() !== '' || hasAudio || Boolean(metadata && metadata.title && metadata.title.trim())

    if (hasContent && !force) {
        if (typeof editorSettings !== 'undefined' && editorSettings.confirmReset && hasUnsavedChanges) {
            const proceed = window.confirm('Save current project and create a new one?')
            if (!proceed) return false
        }
        // Always safely persist the current project before creating a new one!
        saveCurrentProjectToStorage()
    }

    reset(true)
    toggleHomePage(false)
    if (typeof showToast === 'function') {
        showToast(hasContent ? 'Started new project. Previous project saved.' : 'Started new project')
    }
    return true
}
window.createNewProject = createNewProject

// Rebuild flat allSyllables cursor after any tempLyrics mutation.
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
    // Virtual ENDOFLINE entry lets Enter seal the last syllable's duration.
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

    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?]*).*/;
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
                const title = data.title || "YouTube Video"
                const artist = data.author_name || "YouTube"
                document.getElementById('music-title').innerText = title
                document.getElementById('music-artist').innerText = artist
                document.getElementById('music-album').innerText = metadata.album || ""
                if (data.thumbnail_url) document.getElementById('music-album-art').src = data.thumbnail_url
                metadata.title = metadata.title || title
                metadata.artist = metadata.artist || artist
                currentYoutubeId = videoId
                _generateSyntheticWaveform(videoId, player.duration || 210)
                _updatePreviewSongCard()
                _markDirtyAndAutoSave()
            })
            .catch(err => {
                console.error("Could not fetch YouTube metadata", err)
                document.getElementById('music-title').innerText = "YouTube Video"
            })

        if (!importedJSON) {
            currentLyrics = [];
            currentWordIndex = 0;
        }

        const plyCont = document.querySelector('.music-inner .plyr')
        if (plyCont) {
            plyCont.classList.remove('plyr--video')
            plyCont.classList.add('plyr--audio')
        }

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

    input.addEventListener('change', function () {
        const file = this.files[0]
        if (!file) return

        const reader = new FileReader()
        reader.readAsText(file, 'UTF-8')
        reader.onload = function (evt) {
            try {
                pushHistoryState()
                const jsonData = JSON.parse(evt.target.result)
                importedJSON = true
                const fmt = detectKpoeFormat(jsonData)

                elem_lyricsContent.innerHTML = ''

                if (fmt === 'v2') {
                    parseNewKpoeFormat(jsonData)
                } else if (window.lyricspluslib && typeof window.lyricspluslib.v1Tov2 === 'function' && Array.isArray(jsonData.lyrics)) {
                    parseNewKpoeFormat(window.lyricspluslib.v1Tov2(jsonData))
                } else {
                    parseLegacyToV2(jsonData)
                }
                renderTimeline()
                if (isPreviewActive()) refreshLyricsPlusPreview()
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
    metadata.title = meta.title || metadata.title || ''
    metadata.artist = meta.artist || metadata.artist || ''
    metadata.album = meta.album || metadata.album || ''
    metadata.language = meta.language || ''
    metadata.isrc = meta.isrc || ''
    metadata.curator = meta.curator || getSavedCurator()
    metadata.songWriters = meta.songWriters || []

    const normalizedAgents = {}
    if (meta.agents && Object.keys(meta.agents).length > 0) {
        for (const rawKey in meta.agents) {
            const ag = meta.agents[rawKey]
            const alias = (ag.alias || rawKey).replace(/^voice/, 'v')
            normalizedAgents[alias] = {
                type: ag.type || 'person',
                name: ag.name || '',
                alias
            }
        }
    } else {
        normalizedAgents.v1 = { type: 'person', name: '', alias: 'v1' }
    }
    metadata.agents = normalizedAgents
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

        if (partIdx !== prevPartIdx && partIdx >= 0 && metadata.songParts[partIdx] && metadata.songParts[partIdx].name) {
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

        let rawSyllabus = item.syllabus || []
        if (rawSyllabus.length === 0 && item.text && item.text.trim()) {
            const words = splitTextWithSeparators(item.text)
            const baseStart = item.time || 0
            const totalDur = item.duration || (words.length * 400)
            const weights = words.map(w => Math.max(1, w.trim().length))
            const wSum = weights.reduce((a, b) => a + b, 0) || words.length
            let curT = baseStart
            rawSyllabus = words.map((w, wi) => {
                const d = baseStart > 0 ? Math.max(80, Math.round(totalDur * (weights[wi] / wSum))) : 0
                const entry = { time: baseStart > 0 ? curT : 0, duration: d, text: w, isBackground: false }
                curT += d
                return entry
            })
        }

        const translitSyls = item.transliteration?.syllabus || []
        const syllabus = rawSyllabus.map((s, si) => ({
            time: s.time || 0,
            duration: s.duration || 0,
            text: s.text || '',
            isDone: (s.time || 0) > 0,
            isBackground: !!s.isBackground,
            romanizedText: s.romanizedText || translitSyls[si]?.text,
            element: null
        }))

        const rawSinger = (el.singer || 'v1').replace(/^voice/, 'v')
        const singer = rawSinger || 'v1'
        if (!metadata.agents[singer]) {
            metadata.agents[singer] = { type: 'person', name: '', alias: singer }
        }

        const translatedText = item.translatedText || item.translation?.text
        const romanizedText = item.romanizedText || item.transliteration?.text

        newLyrics.push({
            time: item.time || 0,
            duration: item.duration || 0,
            text: item.text || syllabus.map(s => (s.text || '').replace(/]/g, '')).join(''),
            translatedText,
            romanizedText,
            syllabus: syllabus,
            element: {
                key: el.key || ('L' + (lineIndex + 1)),
                singer: singer,
                songPartIndex: partIdx
            },
            isTaggedLine: false, tag: null,
            lineIndex: lineIndex, lineElement: null
        })
        plainText += `${singer}:${_syllabusToMarkup(syllabus, item.text || '')}\n`
        lineIndex++
    })

    tempLyrics = newLyrics
    elem_lyricsInput.value = plainText.trim()
    rebuildLyricsDOM()
    buildAllSyllables()
    _seekToFirstUnsynced()
    renderTimeline()
    _updatePreviewSongCard()
    _markDirtyAndAutoSave()
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

    // Contiguous runs of the same songPart name each get their own entry.
    metadata.songParts = []
    let prevSpName = null
    lineGroups.forEach(group => {
        const spName = group[0]?.element?.songPart || null
        if (spName && spName !== prevSpName) {
            metadata.songParts.push({ name: spName, time: 0, duration: 0 })
        }
        prevSpName = spName
    })

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
            isBackground: !!w.isBackground,
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
        rebuiltPlainText += `${singer}:${_syllabusToMarkup(syllabus, lineText)}\n`
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
            if (!line.tag || line.tag === 'ENDOFLINE' || extractAgentDeclaration(line.text || '')) return
            p.classList.add('tagged-line')
            p.classList.add(lineDisplayIdx % 2 === 0 ? 'even' : 'odd')
            const span = document.createElement('span')
            span.classList.add('lyrics-word')
            span.innerText = (line.text || '').replace(/]/g, '')
            span.id = 'line-' + li
            p.appendChild(span)
            elem_lyricsContent.appendChild(p)
            line.lineElement = p
            lineDisplayIdx++
            return
        }

        p.classList.add(lineDisplayIdx % 2 === 0 ? 'even' : 'odd')
        line.lineElement = p

            ; (line.syllabus || []).forEach((syl, si) => {
                const span = document.createElement('span')
                span.classList.add('lyrics-word')
                span.innerText = (syl.text || '').replace(/]/g, '')
                span.id = 'syl-' + li + '-' + si
                if ((syl.text || '').replace(/]/g, '').trim() === '') span.classList.add('lyrics-space')
                if (isRTL(syl.text)) span.classList.add('rtl-word')
                if (syl.isBackground) span.classList.add('background-word')
                if (syl.isDone) {
                    span.classList.add('done-word')
                    span.style.setProperty('--duration', (syl.duration || 0) + 'ms')
                }
                syl.element = span
                p.appendChild(span)
            })

        elem_lyricsContent.appendChild(p)
        lineDisplayIdx++
    })
}

function _seekToFirstUnsynced() {
    currentWordIndex = allSyllables.length
    for (let i = 0; i < allSyllables.length; i++) {
        const entry = allSyllables[i]
        if (entry.isEndOfLine) continue
        const syl = tempLyrics[entry.lineIdx].syllabus[entry.syllabusIdx]
        if (syl.isBackground) continue
        if (!syl.isDone) {
            currentWordIndex = i
            break
        }
    }
}

function cleanText(text) {
    return (text || '').replace(/[\]\-\s]/g, '').toLowerCase()
}

function calcLineSimilarity(textA, textB) {
    const a = cleanText(textA)
    const b = cleanText(textB)
    if (a === b) return 1.0
    if (!a || !b) return 0.0

    const wordsA = textA.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const wordsB = textB.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (wordsA.length === 0 || wordsB.length === 0) return 0.0

    let common = 0
    const pool = [...wordsB]
    for (const w of wordsA) {
        const idx = pool.indexOf(w)
        if (idx !== -1) {
            common++
            pool.splice(idx, 1)
        }
    }
    const tokenScore = (2.0 * common) / (wordsA.length + wordsB.length)
    if (tokenScore > 0) return tokenScore

    if (a.includes(b) || b.includes(a)) {
        return Math.min(a.length, b.length) / Math.max(a.length, b.length)
    }

    const maxLen = Math.max(a.length, b.length)
    if (maxLen > 0 && maxLen < 50) {
        const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1
                else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
            }
        }
        return (2.0 * dp[a.length][b.length]) / (a.length + b.length)
    }

    return 0.0
}

function alignLines(oldLines, newLines) {
    const M = oldLines.length
    const N = newLines.length
    if (M === 0 || N === 0) return new Map()

    const dp = Array.from({ length: M + 1 }, () => new Float64Array(N + 1))
    const matchScores = Array.from({ length: M }, () => new Float64Array(N))

    for (let i = 0; i < M; i++) {
        for (let j = 0; j < N; j++) {
            const sim = calcLineSimilarity(oldLines[i].text, newLines[j].actualLineText)
            if (sim >= 0.2) {
                const posDiff = Math.abs((M > 1 ? i / (M - 1) : 0) - (N > 1 ? j / (N - 1) : 0))
                matchScores[i][j] = Math.max(0.01, sim - posDiff * 0.15)
            } else {
                matchScores[i][j] = -1
            }
        }
    }

    for (let i = 1; i <= M; i++) {
        for (let j = 1; j <= N; j++) {
            let best = Math.max(dp[i - 1][j], dp[i][j - 1])
            const ms = matchScores[i - 1][j - 1]
            if (ms > 0) {
                best = Math.max(best, dp[i - 1][j - 1] + ms)
            }
            dp[i][j] = best
        }
    }

    let i = M, j = N
    const lineMatchMap = new Map()
    while (i > 0 && j > 0) {
        const ms = matchScores[i - 1][j - 1]
        if (ms > 0 && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + ms)) < 1e-6) {
            lineMatchMap.set(j - 1, oldLines[i - 1])
            i--
            j--
        } else if (dp[i - 1][j] >= dp[i][j - 1]) {
            i--
        } else {
            j--
        }
    }
    return lineMatchMap
}

function parseLyrics() {
    const rawVal = elem_lyricsInput.value.trim()
    if (rawVal === '') {
        elem_lyricsContent.innerHTML = ''
        tempLyrics = []
        allSyllables = []
        currentWordIndex = 0
        lastWordIndex = 0
        unselect()
        renderTimeline()
        if (isPreviewActive()) refreshLyricsPlusPreview()
        return
    }

    if (rawVal.startsWith('<') && /<tt[\s>]/i.test(rawVal) && window.lyricspluslib?.parseAppleTTML) {
        const parsed = window.lyricspluslib.parseAppleTTML(rawVal)
        if (parsed && parsed.lyrics) {
            parseNewKpoeFormat(parsed)
            return
        }
    }

    if (/^\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/m.test(rawVal)) {
        parseLRCText(rawVal)
        return
    }

    elem_lyricsContent.innerHTML = ''

    const oldLyricLines = tempLyrics.filter(l => !l.isTaggedLine)

    metadata.songParts = []
    function addSongPart(tagName) {
        const idx = metadata.songParts.length
        metadata.songParts.push({ name: tagName, time: 0, duration: 0 })
        return idx
    }

    const newLyrics = []
    const rawLines = elem_lyricsInput.value.split('\n')

    rawLines.forEach(l => {
        const decl = extractAgentDeclaration(l.trim())
        if (decl) {
            metadata.agents[decl.alias] = { type: decl.type, name: decl.name, alias: decl.alias }
        }
    })

    const parsedLinesInfo = []
    let seenLyricLine = false
    rawLines.forEach((line, lineIndex) => {
        const trimmed = line.trim()
        if (!trimmed) {
            if (editorSettings.allowSpaceDoubleBracketEndWord && seenLyricLine) {
                parsedLinesInfo.push({ lineIndex, line: '', trimmed: '', isTagOrAgent: false, lineSinger: 'v1', actualLineText: '' })
            }
            return
        }
        const agentDecl = extractAgentDeclaration(trimmed)
        if (agentDecl) {
            metadata.agents[agentDecl.alias] = {
                type: agentDecl.type,
                name: agentDecl.name,
                alias: agentDecl.alias
            }
            return
        }
        const isSongPartTag = isValidTag(trimmed)
        if (isSongPartTag) {
            parsedLinesInfo.push({ lineIndex, line, trimmed, isTagOrAgent: true, agentDecl: null, isSongPartTag })
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
        if (!actualLineText.trim()) {
            if (!editorSettings.allowSpaceDoubleBracketEndWord || !seenLyricLine) return
            actualLineText = ''
        } else {
            seenLyricLine = true
        }
        parsedLinesInfo.push({ lineIndex, line, trimmed, isTagOrAgent: false, lineSinger, actualLineText })
    })

    const newLyricItems = parsedLinesInfo.filter(info => !info.isTagOrAgent)
    const lineMatchMap = alignLines(oldLyricLines, newLyricItems)

    let lineDisplayIdx = 0
    let currentTag = ''
    let currentSongPartIndex = -1
    let lyricItemIdx = 0

    parsedLinesInfo.forEach((info) => {
        const { lineIndex, trimmed, isTagOrAgent, agentDecl, isSongPartTag, lineSinger, actualLineText } = info

        const p = document.createElement('p')
        p.classList.add('lyrics-line')
        p.classList.add(lineDisplayIdx % 2 === 0 ? 'even' : 'odd')

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
            lineDisplayIdx++
            return
        }

        const words = splitTextWithSeparators(actualLineText)
        const syllabus = words.map(w => ({ time: 0, duration: 0, text: w, isDone: false, isBackground: false, element: null }))

        const oldLine = lineMatchMap.get(lyricItemIdx) || null
        lyricItemIdx++

        if (oldLine && oldLine.syllabus) {
            const oldSyls = oldLine.syllabus
            const O = oldSyls.length
            const N = syllabus.length

            const dp = Array.from({ length: O + 1 }, () => new Array(N + 1).fill(0))
            for (let oi = 1; oi <= O; oi++) {
                for (let ni = 1; ni <= N; ni++) {
                    if (cleanText(oldSyls[oi - 1].text) === cleanText(syllabus[ni - 1].text)) {
                        dp[oi][ni] = dp[oi - 1][ni - 1] + 1
                    } else {
                        dp[oi][ni] = Math.max(dp[oi - 1][ni], dp[oi][ni - 1])
                    }
                }
            }

            let oi = O, ni = N
            const matches = []
            while (oi > 0 && ni > 0) {
                if (cleanText(oldSyls[oi - 1].text) === cleanText(syllabus[ni - 1].text)) {
                    matches.push([oi - 1, ni - 1])
                    oi--; ni--
                } else if (dp[oi - 1][ni] >= dp[oi][ni - 1]) {
                    oi--
                } else {
                    ni--
                }
            }

            for (const [oldIdx, newIdx] of matches) {
                const oldSyl = oldSyls[oldIdx]
                syllabus[newIdx].isBackground = !!oldSyl.isBackground
                if (oldSyl.romanizedText) syllabus[newIdx].romanizedText = oldSyl.romanizedText
                if (oldSyl.isDone) {
                    syllabus[newIdx].time = oldSyl.time
                    syllabus[newIdx].duration = oldSyl.duration
                    syllabus[newIdx].isDone = oldSyl.isDone
                }
            }
        }

        const lineText = words.join('')
        const lineTime = syllabus.find(s => s.isDone)?.time || 0
        const lastSyl = [...syllabus].reverse().find(s => s.isDone)
        const lineDur = lastSyl ? (lastSyl.time + lastSyl.duration - lineTime) : 0

        syllabus.forEach((syl, si) => {
            const span = document.createElement('span')
            span.classList.add('lyrics-word')
            span.innerText = (syl.text || '').replace(/]/g, '')
            span.id = 'syl-' + lineIndex + '-' + si
            if ((syl.text || '').replace(/]/g, '').trim() === '') span.classList.add('lyrics-space')
            if (isRTL(syl.text)) span.classList.add('rtl-word')
            if (syl.isBackground) span.classList.add('background-word')
            if (syl.isDone) {
                span.classList.add('done-word')
                span.style.setProperty('--duration', syl.duration + 'ms')
            }
            syl.element = span
            p.appendChild(span)
        })

        if (editorSettings.autoExtractBg && !syllabus.some(s => s.isBackground)) {
            const edgeRun = _findEdgeParenRun(syllabus, 0) || _findEdgeParenRun(syllabus, syllabus.length - 1)
            if (edgeRun) {
                for (let bi = edgeRun.startIdx; bi <= edgeRun.endIdx; bi++) {
                    syllabus[bi].isBackground = true
                    if (syllabus[bi].element) syllabus[bi].element.classList.add('background-word')
                }
            }
        }

        newLyrics.push({
            time: lineTime, duration: lineDur, text: lineText, syllabus: syllabus,
            translatedText: oldLine ? oldLine.translatedText : undefined,
            romanizedText: oldLine ? oldLine.romanizedText : undefined,
            element: { key: 'L' + lineIndex, singer: lineSinger, songPartIndex: currentSongPartIndex },
            isTaggedLine: false, tag: null, lineIndex: lineIndex, lineElement: p
        })
        elem_lyricsContent.appendChild(p)
        lineDisplayIdx++
    })

    tempLyrics = newLyrics
    buildAllSyllables()
    _recalcMissingDurations()
    _seekToFirstUnsynced()
    renderTimeline()
    if (isPreviewActive()) refreshLyricsPlusPreview()
    _markDirtyAndAutoSave()
}

function _recalcMissingDurations() {
    for (let i = 0; i < allSyllables.length - 1; i++) {
        const entry = allSyllables[i]
        const nextEntry = allSyllables[i + 1]
        if (entry.isEndOfLine || nextEntry.isEndOfLine) continue
        const syl = tempLyrics[entry.lineIdx]?.syllabus[entry.syllabusIdx]
        const nextSyl = tempLyrics[nextEntry.lineIdx]?.syllabus[nextEntry.syllabusIdx]
        if (syl && nextSyl && syl.isDone && syl.duration === 0 && nextSyl.isDone && nextSyl.time > syl.time) {
            syl.duration = nextSyl.time - syl.time
            if (syl.element) syl.element.style.setProperty('--duration', syl.duration + 'ms')
        }
    }
    tempLyrics.forEach(line => {
        if (line.isTaggedLine || !line.syllabus || !line.syllabus.length) return
        const doneSyls = line.syllabus.filter(s => s.isDone && s.time > 0)
        if (doneSyls.length === 0) return
        const earliestTime = Math.min(...doneSyls.map(s => s.time))
        const latestEnd = Math.max(...doneSyls.map(s => s.time + s.duration))
        line.time = earliestTime
        line.duration = latestEnd - earliestTime
    })
}

function nextWord() {
    const NextWordButton = document.getElementById('nextword-button')
    if (NextWordButton) {
        NextWordButton.classList.add('enabled')
        setTimeout(() => { NextWordButton.classList.remove('enabled') }, 50)
    }

    if (allSyllables.length === 0 || currentWordIndex >= allSyllables.length) return

    pushHistoryState()
    const time = Math.max(0, (player.currentTime * 1000) + (editorSettings.tapLatencyMs || 0))
    const entry = allSyllables[currentWordIndex]

    // Virtual ENDOFLINE entry seals the last syllable's duration and exits.
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
                if (prevLine && prevLine.syllabus) {
                    const doneSyls = prevLine.syllabus.filter(s => s.isDone && s.time > 0)
                    if (doneSyls.length > 0) {
                        const maxEnd = Math.max(...doneSyls.map(s => s.time + s.duration))
                        prevLine.duration = Math.max(0, maxEnd - (prevLine.time || 0))
                    }
                }
            }
        }
        currentWordIndex++
        renderTimeline()
        if (isPreviewActive()) refreshLyricsPlusPreview()
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
            const prevLine = tempLyrics[prev.lineIdx]
            const prevSyl = prevLine?.syllabus[prev.syllabusIdx]
            if (prevSyl && prevSyl.time > 0) {
                prevSyl.duration = Math.max(0, time - prevSyl.time)
                if (prevSyl.element) {
                    prevSyl.element.style.setProperty('--duration', prevSyl.duration + 'ms')
                    prevSyl.element.classList.add('done-word')
                    prevSyl.element.classList.remove('current-word')
                }
                if (prevLine && prevLine.syllabus) {
                    const prevDone = prevLine.syllabus.filter(s => s.isDone && s.time > 0)
                    if (prevDone.length > 0) {
                        const maxEnd = Math.max(...prevDone.map(s => s.time + s.duration))
                        prevLine.duration = Math.max(0, maxEnd - (prevLine.time || 0))
                    }
                }
            }
        }
    }

    syl.time = time
    syl.isDone = true
    syl.duration = 0

    const doneSyls = line.syllabus.filter(s => s.isDone && s.time > 0)
    if (doneSyls.length > 0) {
        line.time = Math.min(...doneSyls.map(s => s.time))
    } else {
        line.time = time
    }
    const latestSyl = doneSyls.reduce((best, s) => {
        return (s.time + s.duration) > (best.time + best.duration) ? s : best
    }, doneSyls[0] || syl)
    if (latestSyl && latestSyl.time > 0) {
        line.duration = (latestSyl.time + latestSyl.duration) - line.time
    }

    if (syl.element) {
        const prevCurrent = document.querySelector('.current-word')
        if (prevCurrent) prevCurrent.classList.remove('current-word')
        syl.element.classList.add('current-word', 'playing-word')
        elem_lyricsContent.scrollTop = syl.element.offsetTop - elem_lyricsContent.offsetTop - 100
    }

    lastWordIndex = currentWordIndex
    currentWordIndex++
    renderTimeline()
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function openWord(wordIndex) {
    if (wordIndex < 0 || wordIndex >= allSyllables.length) return
    const entry = allSyllables[wordIndex]
    if (!entry || entry.isEndOfLine || entry.lineIdx < 0) return
    const { lineIdx, syllabusIdx } = entry
    const line = tempLyrics[lineIdx]
    if (!line) return
    const syl = line.syllabus[syllabusIdx]
    if (!syl) return

    currentWordIndex = wordIndex
    selectedWordIndex = wordIndex
    selectedWordIndices = new Set([wordIndex])
    const wordLabelEl = document.getElementById('props-word-label')
    if (wordLabelEl) wordLabelEl.textContent = 'WORD'
    const multiRetimeEl = document.getElementById('props-multi-retime')
    if (multiRetimeEl) multiRetimeEl.style.display = 'none'
    const sylRomWrapEl = document.getElementById('props-syl-rom-wrap')
    if (sylRomWrapEl) sylRomWrapEl.style.display = ''

    document.querySelectorAll('.opened-word').forEach(el => el.classList.remove('opened-word'))
    if (syl.element) syl.element.classList.add('opened-word')

    const prevCurrent = document.querySelector('.current-word')
    if (prevCurrent) prevCurrent.classList.remove('current-word')
    if (syl.element) syl.element.classList.add('current-word')

    document.getElementById('properties-word').innerText = syl.text || ''
    document.getElementById('properties-start').value = syl.time || 0
    document.getElementById('properties-length').value = syl.duration || 0
    updateTimeDisplays()

    if (syl.time && syl.time > 0) {
        _userExplicitWordSelect = true
        player.currentTime = syl.time / 1000
        setTimeout(() => { _userExplicitWordSelect = false }, 150)
    }

    const lineTextEl = document.getElementById('properties-line-text')
    if (lineTextEl) lineTextEl.textContent = (line.text || '').trim() || '(empty line)'

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

    const empty = document.getElementById('props-empty')
    const filled = document.getElementById('props-filled')
    if (empty) empty.style.display = 'none'
    if (filled) filled.style.display = 'flex'

    const wRom = document.getElementById('properties-word-romanized')
    if (wRom) wRom.value = (syl.romanizedText || '').trim()
    const lRom = document.getElementById('properties-line-romanized')
    if (lRom) {
        const joinedSylRom = (line.syllabus || []).some(s => s.romanizedText)
            ? (line.syllabus || []).map(s => (s.romanizedText || (s.text || '').replace(/]/g, ''))).join('')
            : (line.romanizedText || '')
        lRom.value = joinedSylRom
    }
    const lTr = document.getElementById('properties-line-translated')
    if (lTr) lTr.value = line.translatedText || ''
    refreshWordActionButtons()
    renderTimelineSelection()
}

function unselect() {
    selectedWordIndex = -1
    if (typeof selectedWordIndices !== 'undefined') selectedWordIndices.clear()
    document.querySelectorAll('.opened-word').forEach(el => el.classList.remove('opened-word'))
    document.getElementById('properties-word').innerText = ''
    document.getElementById('properties-start').value = 0
    document.getElementById('properties-length').value = 0
    updateTimeDisplays()
    const multiRetimeEl = document.getElementById('props-multi-retime')
    if (multiRetimeEl) multiRetimeEl.style.display = 'none'
    const empty = document.getElementById('props-empty')
    const filled = document.getElementById('props-filled')
    if (empty) empty.style.display = 'flex'
    if (filled) filled.style.display = 'none'
    refreshWordActionButtons()
    if (typeof renderTimelineSelection === 'function') renderTimelineSelection()
}

function _resyncAfterStructuralChange(lineIdx, syllabusIdx) {
    rebuildLyricsDOM()
    buildAllSyllables()
    const line = tempLyrics[lineIdx]
    if (line && line.syllabus && line.syllabus[syllabusIdx] !== undefined) {
        const idx = allSyllables.findIndex(a => a.lineIdx === lineIdx && a.syllabusIdx === syllabusIdx)
        if (idx !== -1) { openWord(idx); return }
    }
    unselect()
}

function _syllableHasOpenParen(text) {
    return /\(/.test(text || '')
}
function _syllableHasCloseParen(text) {
    return /\)/.test(text || '')
}

function _findEdgeParenRun(syllabus, syllabusIdx) {
    if (!syllabus || !syllabus.length) return null
    const n = syllabus.length

    if (syllabus[0] && _syllableHasOpenParen(syllabus[0].text)) {
        let end = -1
        for (let i = 0; i < n; i++) {
            if (_syllableHasCloseParen(syllabus[i].text)) { end = i; break }
        }
        if (end !== -1 && syllabusIdx >= 0 && syllabusIdx <= end) {
            return { startIdx: 0, endIdx: end }
        }
    }

    if (syllabus[n - 1] && _syllableHasCloseParen(syllabus[n - 1].text)) {
        let start = -1
        for (let i = n - 1; i >= 0; i--) {
            if (_syllableHasOpenParen(syllabus[i].text)) { start = i; break }
        }
        if (start !== -1 && syllabusIdx >= start && syllabusIdx <= n - 1) {
            return { startIdx: start, endIdx: n - 1 }
        }
    }

    return null
}

function _lineHasBackgroundRun(line, excludingRange) {
    return (line.syllabus || []).some((s, i) => {
        if (excludingRange && i >= excludingRange.startIdx && i <= excludingRange.endIdx) return false
        return !!s.isBackground
    })
}

function _getBackgroundActionForSelection() {
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) {
        return { mode: 'blocked', reason: 'No word selected' }
    }
    const { lineIdx, syllabusIdx } = allSyllables[selectedWordIndex]
    const line = tempLyrics[lineIdx]
    if (!line) return { mode: 'blocked', reason: 'No word selected' }
    const syl = line.syllabus[syllabusIdx]
    if (!syl) return { mode: 'blocked', reason: 'No word selected' }

    if (syl.isBackground) {
        let start = syllabusIdx, end = syllabusIdx
        while (start > 0 && line.syllabus[start - 1].isBackground) start--
        while (end < line.syllabus.length - 1 && line.syllabus[end + 1].isBackground) end++
        return { mode: 'unmark', run: { startIdx: start, endIdx: end } }
    }

    const run = _findEdgeParenRun(line.syllabus, syllabusIdx)
    if (!run) {
        return { mode: 'blocked', reason: 'Only a "(...)" sentence at the start or end of the line can be marked' }
    }
    if (_lineHasBackgroundRun(line, run)) {
        return { mode: 'blocked', reason: 'This line already has a background vocal section' }
    }
    return { mode: 'mark', run }
}

function refreshWordActionButtons() {
    const btnSplit = document.getElementById('btn-split-word')
    const btnMerge = document.getElementById('btn-merge-word')
    const btn = document.getElementById('btn-toggle-background')

    if (typeof selectedWordIndices !== 'undefined' && selectedWordIndices.size > 1) {
        const entries = _getSelectedEntries()
        if (btnSplit) btnSplit.disabled = true
        if (btnMerge) {
            const byLine = new Map()
            entries.forEach(e => byLine.set(e.lineIdx, (byLine.get(e.lineIdx) || 0) + 1))
            btnMerge.disabled = !Array.from(byLine.values()).some(c => c >= 2)
        }
        if (btn) {
            btn.disabled = false
            const allBg = entries.every(e => e.syl.isBackground)
            btn.classList.toggle('active', allBg)
            btn.textContent = allBg ? 'Unmark bg' : 'Background'
            btn.title = allBg ? 'Remove background vocal from selected words' : 'Mark selected words as background vocal'
        }
        return
    }

    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length || allSyllables[selectedWordIndex]?.isEndOfLine) {
        if (btnSplit) btnSplit.disabled = true
        if (btnMerge) btnMerge.disabled = true
        if (btn) {
            btn.disabled = true
            btn.classList.remove('active')
            btn.textContent = 'Background'
        }
        return
    }

    const { lineIdx, syllabusIdx } = allSyllables[selectedWordIndex]
    const line = tempLyrics[lineIdx]
    const syl = line?.syllabus[syllabusIdx]
    if (btnSplit) btnSplit.disabled = !syl || (syl.text || '').trim().length <= 1
    if (btnMerge) btnMerge.disabled = !line || syllabusIdx >= line.syllabus.length - 1
    if (!btn) return

    const action = _getBackgroundActionForSelection()
    if (action.mode === 'mark') {
        btn.disabled = false
        btn.classList.remove('active')
        btn.textContent = 'Background'
        btn.title = 'Mark this parenthesized sentence as background vocal'
    } else if (action.mode === 'unmark') {
        btn.disabled = false
        btn.classList.add('active')
        btn.textContent = 'Unmark bg'
        btn.title = 'Remove background vocal marking'
    } else {
        btn.disabled = false
        btn.classList.toggle('active', !!syl?.isBackground)
        btn.textContent = syl?.isBackground ? 'Unmark bg' : 'Background'
        btn.title = 'Toggle background vocal on selected word'
    }
}

function toggleBackgroundVocal() {
    if (typeof selectedWordIndices !== 'undefined' && selectedWordIndices.size > 1) {
        const entries = _getSelectedEntries()
        if (!entries.length) return
        pushHistoryState()
        const isMarking = !entries.every(e => e.syl.isBackground)
        entries.forEach(e => {
            e.syl.isBackground = isMarking
            if (e.syl.element) e.syl.element.classList.toggle('background-word', isMarking)
        })
        refreshWordActionButtons()
        renderTimeline()
        if (isPreviewActive()) refreshLyricsPlusPreview()
        _markDirtyAndAutoSave()
        return
    }

    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const entry = allSyllables[selectedWordIndex]
    if (!entry || entry.isEndOfLine || entry.lineIdx < 0) return
    const { lineIdx, syllabusIdx } = entry
    const line = tempLyrics[lineIdx]
    if (!line) return

    pushHistoryState()
    const action = _getBackgroundActionForSelection()
    if (action.mode === 'blocked') {
        const syl = line.syllabus[syllabusIdx]
        if (!syl) return
        const isMarking = !syl.isBackground
        syl.isBackground = isMarking
        if (syl.element) syl.element.classList.toggle('background-word', isMarking)
    } else {
        const { startIdx, endIdx } = action.run
        const isMarking = (action.mode === 'mark')
        for (let i = startIdx; i <= endIdx; i++) {
            line.syllabus[i].isBackground = isMarking
            if (line.syllabus[i].element) {
                line.syllabus[i].element.classList.toggle('background-word', isMarking)
            }
        }
    }

    refreshWordActionButtons()
    renderTimeline()
    if (isPreviewActive()) refreshLyricsPlusPreview()
    _markDirtyAndAutoSave()
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

function isPreviewActive() {
    return centerMode === 'preview'
}

function setCenterMode(mode) {
    centerMode = mode
    const lc = document.getElementById('lyrics-content')
    const tlView = document.getElementById('timeline-view')
    const prevStage = document.getElementById('preview-stage')

    const tbSync = document.getElementById('toolbar-sync')
    const tbTl = document.getElementById('toolbar-timeline')
    const tbPrev = document.getElementById('toolbar-preview')

    document.getElementById('tab-mode-sync')?.classList.toggle('active', mode === 'sync')
    document.getElementById('tab-mode-timeline')?.classList.toggle('active', mode === 'timeline')
    document.getElementById('tab-mode-preview')?.classList.toggle('active', mode === 'preview')

    if (tbSync) tbSync.style.display = mode === 'sync' ? 'flex' : 'none'
    if (tbTl) tbTl.style.display = mode === 'timeline' ? 'flex' : 'none'
    if (tbPrev) tbPrev.style.display = mode === 'preview' ? 'flex' : 'none'

    if (lc) {
        lc.classList.toggle('preview', mode === 'preview')
        lc.style.display = mode === 'sync' ? 'flex' : 'none'
    }
    if (tlView) tlView.style.display = mode === 'timeline' ? 'flex' : 'none'
    if (prevStage) prevStage.style.display = mode === 'preview' ? 'block' : 'none'

    const partLeft = document.querySelector('.part-left')
    const partRight = document.querySelector('.part-right')
    if (partLeft) partLeft.setAttribute('visible', mode === 'sync' ? 'true' : 'false')
    if (partRight) partRight.setAttribute('visible', mode === 'preview' ? 'false' : 'true')

    if (mode !== 'preview' && lyricsRendererInstance && lyricsRendererInstance.lyricsAnimationFrameId) {
        cancelAnimationFrame(lyricsRendererInstance.lyricsAnimationFrameId)
        lyricsRendererInstance.lyricsAnimationFrameId = null
    }
    if (mode === 'timeline') {
        elem_navbar?.setAttribute('visible', 'false')
        isVisible = false
        requestAnimationFrame(() => renderTimeline())
    } else if (mode === 'preview') {
        elem_navbar?.setAttribute('visible', 'false')
        isVisible = false
        requestAnimationFrame(() => refreshLyricsPlusPreview())
    }
}

function previewToggle() {
    setCenterMode(centerMode === 'preview' ? 'sync' : 'preview')
}

document.getElementById('preview-theme')?.addEventListener('change', () => {
    const sel = document.getElementById('preview-theme')
    if (sel) document.getElementById('lyrics-content').setAttribute('data-theme', sel.value)
})

function _recomputeSongPartTimeline() {
    const partFirstTime = {}, partLastEnd = {}
    tempLyrics.forEach(line => {
        if (line.isTaggedLine) return
        const pi = line.element?.songPartIndex
        if (pi == null || pi < 0) return
        const s = line.time || 0
        if (!s && !line.duration) return
        if (partFirstTime[pi] == null || s < partFirstTime[pi]) partFirstTime[pi] = s
        const e = s + (line.duration || 0)
        if (partLastEnd[pi] == null || e > partLastEnd[pi]) partLastEnd[pi] = e
    })
    const totalMs = (player.duration || 0) * 1000

    metadata.songParts.forEach((part, i) => {
        const start = partFirstTime[i]
        if (start == null) { part.time = 0; part.duration = 0; return }
        part.time = Math.round(start)
        let nextStart = null
        for (let j = i + 1; j < metadata.songParts.length; j++) {
            if (partFirstTime[j] != null) { nextStart = partFirstTime[j]; break }
        }
        if (nextStart != null) {
            part.duration = Math.round(Math.max(0, nextStart - start))
        } else {
            const contentEnd = partLastEnd[i] != null ? partLastEnd[i] : start
            const clampedEnd = totalMs > 0 ? Math.min(contentEnd, totalMs) : contentEnd
            part.duration = Math.round(Math.max(0, clampedEnd - start))
        }
    })

    // Anti-overlap clamp across consecutive songParts.
    for (let i = 0; i < metadata.songParts.length - 1; i++) {
        const cur = metadata.songParts[i]
        const next = metadata.songParts[i + 1]
        if (!cur.time && !cur.duration) continue
        if (!next.time && !next.duration) continue
        const curEnd = cur.time + cur.duration
        if (curEnd > next.time) cur.duration = Math.max(0, next.time - cur.time)
    }

    // Clamp every songPart to total song duration.
    if (totalMs > 0) {
        metadata.songParts.forEach(part => {
            if (!part.time && !part.duration) return
            if (part.time + part.duration > totalMs) part.duration = Math.max(0, totalMs - part.time)
            if (part.time > totalMs) { part.time = totalMs; part.duration = 0 }
        })
    }
}

function prepareNewKpoeJSON(cleanTiming = true) {
    if (!tempLyrics || tempLyrics.length === 0) return new Blob(['{}'], { type: 'application/json' })

    _recomputeSongPartTimeline()

    const durMs = (player.duration || 0) * 1000
    const tMin = Math.floor(durMs / 60000)
    const tSec = ((durMs % 60000) / 1000).toFixed(3)
    metadata.totalDuration = tMin + ':' + String(tSec).padStart(6, '0')

    const exportedLyrics = tempLyrics
        .filter(l => {
            if (l.isTaggedLine) return false;
            if (cleanTiming && (l.text || '').replace(/\]/g, '').trim() === '') return false;
            return true;
        })
        .map(line => {
            const rawFiltered = (line.syllabus || [])
                .filter(s => !cleanTiming || (s.text || '').replace(/\]/g, '').trim() !== '');

            const cleanedSyllables = rawFiltered.map(s => {
                const start = Math.round(s.time || 0);
                const end = Math.round((s.time || 0) + (s.duration || 0));
                const out = {
                    time: start,
                    duration: Math.max(0, end - start),
                    text: (s.text || '').replace(/\]/g, '')
                };
                if (s.isBackground) out.isBackground = true;
                if (s.romanizedText) out.romanizedText = s.romanizedText;
                return out;
            });

            let actualLineDuration = Math.round(line.duration || 0);
            if (cleanedSyllables.length > 0) {
                const lineEnd = Math.max(...cleanedSyllables.map(s => s.time + s.duration));
                actualLineDuration = Math.max(0, lineEnd - Math.round(line.time || 0));
            }

            const reconstructedText = cleanedSyllables.map(s => s.text).join('');
            const lineOut = {
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
            if (line.romanizedText) lineOut.romanizedText = line.romanizedText;
            if (line.translatedText) lineOut.translatedText = line.translatedText;
            return lineOut;
        });

    return new Blob([JSON.stringify({
        KpoeTools: AppVersion.version,
        type: 'Word',
        metadata: {
            source: metadata.source,
            songWriters: metadata.songWriters,
            title: metadata.title,
            artist: metadata.artist || '',
            album: metadata.album || '',
            language: metadata.language,
            isrc: metadata.isrc || '',
            curator: metadata.curator || 'Kmake',
            agents: metadata.agents,
            songParts: metadata.songParts,
            totalDuration: metadata.totalDuration
        },
        lyrics: exportedLyrics
    }, null, 4)], { type: 'application/json' })
}

function prepareLegacyJSON(cleanTiming = true) {
    if (!tempLyrics || tempLyrics.length === 0) return new Blob(['{}'], { type: 'application/json' })
    _recomputeSongPartTimeline()
    const durMs = (player.duration || 0) * 1000
    const tMin = Math.floor(durMs / 60000)
    const tSec = ((durMs % 60000) / 1000).toFixed(3)
    metadata.totalDuration = tMin + ':' + String(tSec).padStart(6, '0')

    const exportedWords = []
    tempLyrics.forEach(line => {
        if (line.isTaggedLine) return

        if (cleanTiming && (line.text || '').replace(/\]/g, '').trim() === '') return;

        const syllabus = line.syllabus || []
        const partIdx = line.element?.songPartIndex ?? -1
        const partName = (partIdx >= 0 && metadata.songParts[partIdx]) ? metadata.songParts[partIdx].name : null
        const singer = line.element?.singer || 'v1'
        const key = line.element?.key || ''

        const activeSyllables = syllabus.filter(syl => {
            const cleaned = (syl.text || '').replace(/\]/g, '').trim();
            return !cleanTiming || cleaned !== '';
        });

        activeSyllables.forEach((syl, si) => {
            const start = Math.round(syl.time || 0);
            const end = Math.round((syl.time || 0) + (syl.duration || 0));
            const word = {
                time: start,
                duration: Math.max(0, end - start),
                text: (syl.text || '').replace(/\]/g, ''),
                isLineEnding: si === activeSyllables.length - 1 ? 1 : 0,
                element: { key, songPart: partName, singer }
            };
            if (syl.isBackground) word.isBackground = true;
            exportedWords.push(word);
        });
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
        const syllabus = (line.syllabus || []).filter(s => (s.text || '').replace(/]/g, '').trim() !== '')
        if (!syllabus.length) return
        const lineTime = line.time || syllabus[0].time || 0
        const lineText = syllabus.map(s => (s.text || '').replace(/]/g, '')).join('').trim()
        if (!lineText) return
        lrcContent += '[' + msToTime(lineTime) + ']' + lineText + '\n'
    })
    return new Blob([lrcContent.trim()], { type: 'text/plain' })
}

function prepareELRC() {
    if (!tempLyrics || tempLyrics.length === 0) return new Blob([''], { type: 'text/plain' })

    let lrcContent = ''
    tempLyrics.forEach(line => {
        if (!line || line.isTaggedLine) return
        const syllabus = (line.syllabus || []).filter(s => (s.text || '').replace(/]/g, '').trim() !== '')
        if (!syllabus.length) return
        let first = true
        syllabus.forEach(syl => {
            const cleanText = (syl.text || '').replace(/]/g, '')
            if (first) {
                lrcContent += '\n[' + msToTime(syl.time || 0) + ']' + cleanText
                first = false
            } else {
                lrcContent += ' <' + msToTime(syl.time || 0) + '>' + cleanText
            }
        })
    })
    return new Blob([lrcContent.trim()], { type: 'text/plain' })
}

function exportNewKpoeJSON() {
    if (!metadataEverOpened) { openMetadataEditor(() => exportNewKpoeJSON()); return }
    _runExport(() => downloadBlob(prepareNewKpoeJSON()))
}

function exportLegacyJSON() {
    if (!metadataEverOpened) { openMetadataEditor(() => exportLegacyJSON()); return }
    _runExport(() => downloadBlob(prepareLegacyJSON()))
}

function exportJSON() {
    exportNewKpoeJSON()
}

function exportLRC() {
    if (!metadataEverOpened) { openMetadataEditor(() => exportLRC()); return }
    _runExport(() => downloadBlob(prepareLRC(), 'lrc'))
}

function exportELRC() {
    if (!metadataEverOpened) { openMetadataEditor(() => exportELRC()); return }
    _runExport(() => downloadBlob(prepareELRC(), 'lrc'))
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
    if (!music_file) { alert('Please import a music file first.'); return }
    if (!metadataEverOpened) { openMetadataEditor(() => exportKMAKE()); return }
    _runExport(() => {
        var zip = new JSZip()
        zip.file("audiofile.kmakefile", music_file)
        zip.file("lyrics.kmakefile", prepareNewKpoeJSON(false))
        zip.generateAsync({ type: 'blob', mimeType: 'application/kmake' })
            .then(content => downloadBlob(content, 'kmake'))
    })
}

function importKMAKE() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.kmake'
    input.onchange = e => {
        reset(true)

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

setInterval(() => {
    try {
        if (centerMode === 'preview') return
        if (centerMode === 'timeline') {
            updateTimelinePlayhead()
            return
        }
        if (!tempLyrics || tempLyrics.length === 0) return

        const lyricsContent = document.getElementById('lyrics-content')
        if (!lyricsContent) return

        if (player.paused) {
            lyricsContent.classList.add('paused')
        } else {
            lyricsContent.classList.remove('paused')
        }

        const time = (player.currentTime || 0) * 1000

        let currentSylRef = null
        for (let i = 0; i < allSyllables.length; i++) {
            const entry = allSyllables[i]
            if (!entry || entry.isEndOfLine || entry.lineIdx < 0) continue
            const syl = tempLyrics[entry.lineIdx]?.syllabus[entry.syllabusIdx]
            if (!syl || !syl.isDone || syl.time == null) continue
            if (syl.time <= time) {
                currentSylRef = entry
            } else {
                break
            }
        }

        let currentSyl = null
        if (currentSylRef) {
            currentSyl = tempLyrics[currentSylRef.lineIdx]?.syllabus[currentSylRef.syllabusIdx]
        }
        const currentSylElem = currentSyl?.element || null
        const playingEl = document.querySelector('.playing-word')
        if (playingEl && playingEl !== currentSylElem) {
            playingEl.classList.remove('playing-word')
        }
        if (currentSylElem && !currentSylElem.classList.contains('playing-word')) {
            currentSylElem.classList.add('playing-word')
        }

        const sylId = currentSylRef ? `${currentSylRef.lineIdx}-${currentSylRef.syllabusIdx}` : ''
        if (sylId === lastPlayedSylId) return
        lastPlayedSylId = sylId
        played_word = currentSyl?.text || ''

        const allSylElems = Array.from(document.querySelectorAll('.lyrics-word')).filter(el => el.id && el.id.startsWith('syl-'))
        const currentElemIdx = currentSylElem ? allSylElems.indexOf(currentSylElem) : -1
        allSylElems.forEach((el, idx) => { el.classList.toggle('past-word', idx < currentElemIdx) })

        document.querySelectorAll('.lyrics-line:not(.tagged-line)').forEach(l => {
            l.classList.remove('playing-line', 'next-playing-line', 'previous-playing-line', 'next-next-playing-line')
        })

        if (!currentSylElem) return
        const lyricsLine = currentSylElem.closest('.lyrics-line')
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

        if (lyricsContent.classList.contains('preview')) {
            lyricsContent.scrollTop = lyricsLine.offsetTop - lyricsContent.clientHeight / 2 + 120
        }
    } catch (e) {}
}, 20)

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
    currentYoutubeId = ''
    _decodeAudioWaveform(file)
    _markDirtyAndAutoSave()
    document.getElementById('music-title').innerText = "Unknown Title"
    document.getElementById('music-artist').innerText = "Unknown Artist"
    document.getElementById('music-album').innerText = "Unknown Album"
    document.getElementById('music-album-art').src = ''

    filename = file.name.split('.').slice(0, -1).join('.')

    jsmediatags.read(file, {
        onSuccess: function (tag) {
            const title = tag.tags.title || "Unknown Title"
            const artist = tag.tags.artist || "Unknown Artist"
            const album = tag.tags.album || "Unknown Album"
            document.getElementById('music-title').innerText = title
            document.getElementById('music-artist').innerText = artist
            document.getElementById('music-album').innerText = album
            metadata.title = metadata.title || title
            metadata.artist = metadata.artist || artist
            metadata.album = metadata.album || album
            if (tag.tags.picture) {
                const data = tag.tags.picture.data
                const format = tag.tags.picture.format
                const base64String = _arrayBufferToBase64(data)
                document.getElementById('music-album-art').src = `data:${format};base64,${base64String}`
            } else {
                document.getElementById('music-album-art').src = ''
            }
            if (tag.tags["TXXX"] && tag.tags["TXXX"].description === "Writer") {
                metadata.songWriters = (tag.tags["TXXX"].data || '').split(',').map(s => s.trim()).filter(Boolean)
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

player.on('seeked', function () {
    if (document.activeElement && (document.activeElement.closest('.plyr') || document.activeElement.tagName === 'BUTTON')) {
        document.activeElement.blur()
    }
})

function isTextInputActive(target = document.activeElement) {
    if (!target) return false
    if (target.closest('.kmake-modal')) {
        const tag = target.tagName
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }
    if (target === elem_lyricsInput) return true
    if (target.isContentEditable) return true
    if (target.closest('.plyr')) return false
    if (target.id === 'properties-start' || target.id === 'properties-length') return true
    if (target.tagName === 'TEXTAREA') return true
    if (target.tagName === 'INPUT' && !['range', 'button', 'submit', 'checkbox', 'radio'].includes(target.type)) {
        return true
    }
    return false
}

document.addEventListener('keydown', function (event) {
    if (_recordingShortcutKey) {
        event.preventDefault()
        event.stopPropagation()
        _finishShortcutRecord(event)
        return
    }

    if (event.key === 'Escape' || event.keyCode === 27) {
        if (document.getElementById('kmake-walkthrough-overlay')) { endInteractiveWalkthrough(); return }
        if (document.getElementById('whatsnew-modal')) { closeWhatsNewModal(); return }
        if (document.getElementById('settings-modal')) { closeSettingsModal(); return }
        if (document.getElementById('translit-modal')) { document.getElementById('translit-modal').remove(); return }
        if (document.getElementById('timing-tools-modal')) { document.getElementById('timing-tools-modal').remove(); return }
        if (document.getElementById('audit-modal')) { document.getElementById('audit-modal').remove(); return }
        if (document.getElementById('metadata-modal')) { closeMetadataEditor(); return }
        if (document.getElementById('agent-manager-modal')) { closeAgentManager(); return }
        if (document.getElementById('tutorial-modal')) { closeTutorial(); return }
        if (document.getElementById('about-modal')) { closeAboutModal(); return }
        if (selectedWordIndex !== -1 || (typeof selectedWordIndices !== 'undefined' && selectedWordIndices.size > 0)) {
            unselect()
            return
        }
    }

    if (document.getElementById('settings-modal') && event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault()
        document.getElementById('settings-search-input')?.focus()
        return
    }

    if (event.keyCode === 13) {
        if (document.getElementById('metadata-modal') && document.activeElement?.tagName === 'INPUT') {
            event.preventDefault()
            saveMetadata()
            return
        }
        if (document.getElementById('agent-manager-modal') && document.activeElement?.tagName === 'INPUT') {
            event.preventDefault()
            saveAgents()
            return
        }
    }

    if (document.querySelector('.kmake-modal')) return
    const hp = document.getElementById('home-page')
    if (hp && hp.style.display !== 'none') return

    if (isTextInputActive()) return

    if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase()
        if (key === 'a') {
            event.preventDefault()
            selectAllTimelineWords()
            return
        }
        if (key === 'l') {
            event.preventDefault()
            selectCurrentLineWords()
            return
        }
        if (key === 'e') {
            event.preventDefault()
            exportNewKpoeJSON()
            return
        }
        if (key === 's') {
            event.preventDefault()
            exportKMAKE()
            return
        }
        if (key === 'o') {
            event.preventDefault()
            importKMAKE()
            return
        }
        if (key === 'z') {
            event.preventDefault()
            if (event.shiftKey) redo()
            else undo()
            return
        }
        if (key === 'y') {
            event.preventDefault()
            redo()
            return
        }
    }

    if (document.activeElement && (document.activeElement.closest('.plyr') || document.activeElement.tagName === 'BUTTON')) {
        if (_matchesShortcut(event, 'stampWord') || _matchesShortcut(event, 'playPause')) {
            document.activeElement.blur()
        }
    }

    if (_matchesShortcut(event, 'playPause')) {
        event.preventDefault()
        playPause()
        return
    }

    if (_matchesShortcut(event, 'endWord')) {
        event.preventDefault()
        endCurrentWord()
        return
    }

    if (_matchesShortcut(event, 'stampWord')) {
        event.preventDefault()
        if (event.repeat) return
        _enterDownAt = Date.now()
        _enterHeld = true
        nextWord()
        return
    }

    if (_matchesShortcut(event, 'stepBack')) {
        event.preventDefault()
        stepBackWord()
        return
    }

    if (_matchesShortcut(event, 'toggleBg') && selectedWordIndex !== -1) {
        event.preventDefault()
        toggleBackgroundVocal()
        return
    }

    if (centerMode === 'timeline') {
        if (_matchesShortcut(event, 'tlFollow')) { event.preventDefault(); toggleTimelineFollow(); return }
        if (_matchesShortcut(event, 'tlRolling')) { event.preventDefault(); toggleTimelineRipple(); return }
        if (_matchesShortcut(event, 'tlSnap')) { event.preventDefault(); toggleTimelineSnap(); return }
        if (event.key === '=' || event.key === '+') { event.preventDefault(); timelineZoom(20); return }
        if (event.key === '-') { event.preventDefault(); timelineZoom(-20); return }
        if ((event.altKey || event.shiftKey) && (event.keyCode === 37 || event.keyCode === 39) && selectedWordIndex !== -1) {
            event.preventDefault()
            const delta = (event.keyCode === 37 ? -1 : 1) * (event.shiftKey ? 50 : 10)
            nudgeProperty('start', delta)
            return
        }
    }

    const isPrevKey = _matchesShortcut(event, 'prevWord') || event.keyCode === 37
    const isNextKey = _matchesShortcut(event, 'nextWordNav') || event.keyCode === 39

    if (isPrevKey) {
        event.preventDefault()
        if (currentWordIndex + goBackIndex > 0) {
            goBackIndex -= 1
        }
    } else if (isNextKey) {
        event.preventDefault()
        goBackIndex += 1
        if (goBackIndex > 0) goBackIndex = 0
    }

    if (isPrevKey || isNextKey) {
        const targetIndex = currentWordIndex + goBackIndex
        if (targetIndex >= 0 && targetIndex < allSyllables.length) {
            const entry = allSyllables[targetIndex]
            if (entry && !entry.isEndOfLine && entry.lineIdx >= 0) {
                const syl = tempLyrics[entry.lineIdx]?.syllabus[entry.syllabusIdx]
                if (syl && syl.time !== undefined) player.currentTime = syl.time / 1000
            }
        }
    }
})

document.addEventListener('keyup', function (event) {
    if (_enterHeld && (_matchesShortcut(event, 'stampWord') || event.keyCode === 13)) {
        _enterHeld = false
        const heldMs = Date.now() - _enterDownAt
        if (heldMs >= (editorSettings.holdThresholdMs || 180) && currentWordIndex > 0) {
            const prev = allSyllables[currentWordIndex - 1]
            if (prev && !prev.isEndOfLine) {
                const syl = tempLyrics[prev.lineIdx]?.syllabus[prev.syllabusIdx]
                if (syl && syl.time > 0) {
                    const nowMs = Math.round(player.currentTime * 1000)
                    if (nowMs > syl.time + 40) {
                        syl.duration = nowMs - syl.time
                        if (syl.element) {
                            syl.element.style.setProperty('--duration', syl.duration + 'ms')
                            syl.element.classList.add('done-word')
                        }
                        _recalcLineBounds(tempLyrics[prev.lineIdx])
                        if (selectedWordIndex === currentWordIndex - 1) {
                            const lenIn = document.getElementById('properties-length')
                            if (lenIn) lenIn.value = syl.duration
                            updateTimeDisplays()
                        }
                        renderTimeline()
                        if (isPreviewActive()) refreshLyricsPlusPreview()
                    }
                }
            }
        }
    }
})

document.addEventListener('click', function (event) {
    if (event.target.classList.contains('lyrics-word')) {
        const el = event.target
        if (el.id && el.id.startsWith('syl-')) {
            const parts = el.id.split('-')
            const li = parseInt(parts[1])
            const si = parseInt(parts[2])
            const idx = allSyllables.findIndex(a => a.lineIdx === li && a.syllabusIdx === si)
            if (idx === -1) return
            if (event.ctrlKey || event.metaKey) {
                const nextSet = new Set(selectedWordIndices)
                if (selectedWordIndex >= 0 && nextSet.size === 0) nextSet.add(selectedWordIndex)
                if (nextSet.has(idx)) nextSet.delete(idx)
                else nextSet.add(idx)
                setMultiWordSelection(Array.from(nextSet), idx)
            } else if (event.shiftKey && selectedWordIndex >= 0) {
                const minI = Math.min(selectedWordIndex, idx)
                const maxI = Math.max(selectedWordIndex, idx)
                const range = []
                for (let i = minI; i <= maxI; i++) {
                    if (!allSyllables[i]?.isEndOfLine) range.push(i)
                }
                setMultiWordSelection(range, selectedWordIndex)
            } else {
                openWord(idx)
            }
        }
    }
})

function onPropStartChange(event) {
    const newVal = Math.max(0, parseInt(event.target.value) || 0)
    if (typeof selectedWordIndices !== 'undefined' && selectedWordIndices.size > 1) {
        const entries = _getSelectedEntries()
        if (!entries.length) return
        const snaps = entries.map(e => {
            const wp = _timelineChipMap.get(e.idx)
            const st = (e.syl.isDone && e.syl.time > 0) ? e.syl.time : (wp ? wp.startMs : 0)
            const du = (e.syl.isDone && e.syl.duration > 0) ? e.syl.duration : (wp ? wp.durMs : 300)
            return { e, st, du }
        })
        const minStart = Math.min(...snaps.map(x => x.st))
        const delta = newVal - minStart
        const affectedLines = new Set()
        snaps.forEach(({ e, st, du }) => {
            e.syl.time = Math.max(0, st + delta)
            e.syl.duration = du
            e.syl.isDone = true
            if (e.syl.element) {
                e.syl.element.classList.add('done-word')
                e.syl.element.style.setProperty('--duration', du + 'ms')
            }
            affectedLines.add(e.line)
        })
        affectedLines.forEach(l => _recalcLineBounds(l))
        updateTimeDisplays()
        renderTimeline()
        if (isPreviewActive()) refreshLyricsPlusPreview()
        _markDirtyAndAutoSave()
        return
    }
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const entry = allSyllables[selectedWordIndex]
    if (!entry || entry.isEndOfLine || entry.lineIdx < 0) return
    const { lineIdx, syllabusIdx } = entry
    const line = tempLyrics[lineIdx]
    const syl = line?.syllabus[syllabusIdx]
    if (!syl) return
    syl.time = newVal
    syl.isDone = true
    if (syl.element) syl.element.classList.add('done-word')

    _recalcLineBounds(line)
    updateTimeDisplays()
    renderTimeline()
    if (isPreviewActive()) refreshLyricsPlusPreview()
    _markDirtyAndAutoSave()
}
const propStartEl = document.getElementById('properties-start')
propStartEl?.addEventListener('input', onPropStartChange)
propStartEl?.addEventListener('change', onPropStartChange)

function onPropLengthChange(event) {
    const newVal = Math.max(0, parseInt(event.target.value) || 0)
    if (typeof selectedWordIndices !== 'undefined' && selectedWordIndices.size > 1) {
        const entries = _getSelectedEntries()
        if (!entries.length) return
        const snaps = entries.map(e => {
            const wp = _timelineChipMap.get(e.idx)
            const st = (e.syl.isDone && e.syl.time > 0) ? e.syl.time : (wp ? wp.startMs : 0)
            const du = (e.syl.isDone && e.syl.duration > 0) ? e.syl.duration : (wp ? wp.durMs : 300)
            return { e, st, du }
        })
        const minStart = Math.min(...snaps.map(x => x.st))
        const maxEnd = Math.max(...snaps.map(x => x.st + x.du))
        const curSpan = Math.max(60, maxEnd - minStart)
        const factor = Math.max(40, newVal) / curSpan
        const affectedLines = new Set()
        snaps.forEach(({ e, st, du }) => {
            e.syl.time = Math.max(0, Math.round(minStart + (st - minStart) * factor))
            e.syl.duration = Math.max(40, Math.round(du * factor))
            e.syl.isDone = true
            if (e.syl.element) {
                e.syl.element.classList.add('done-word')
                e.syl.element.style.setProperty('--duration', e.syl.duration + 'ms')
            }
            affectedLines.add(e.line)
        })
        affectedLines.forEach(l => _recalcLineBounds(l))
        updateTimeDisplays()
        renderTimeline()
        if (isPreviewActive()) refreshLyricsPlusPreview()
        _markDirtyAndAutoSave()
        return
    }
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const entry = allSyllables[selectedWordIndex]
    if (!entry || entry.isEndOfLine || entry.lineIdx < 0) return
    const { lineIdx, syllabusIdx } = entry
    const line = tempLyrics[lineIdx]
    const syl = line?.syllabus[syllabusIdx]
    if (!syl) return
    syl.duration = newVal
    if (syl.element) syl.element.style.setProperty('--duration', syl.duration + 'ms')

    _recalcLineBounds(line)
    updateTimeDisplays()
    renderTimeline()
    if (isPreviewActive()) refreshLyricsPlusPreview()
    _markDirtyAndAutoSave()
}
const propLenEl = document.getElementById('properties-length')
propLenEl?.addEventListener('input', onPropLengthChange)
propLenEl?.addEventListener('change', onPropLengthChange)

document.getElementById('properties-preview')?.addEventListener('click', function (event) {
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const entry = allSyllables[selectedWordIndex]
    if (!entry || entry.isEndOfLine || entry.lineIdx < 0) return
    const { lineIdx, syllabusIdx } = entry
    const syl = tempLyrics[lineIdx]?.syllabus[syllabusIdx]
    if (!syl) return
    player.currentTime = (syl.time || 0) / 1000
    player.play()
    setTimeout(() => { player.pause() }, Math.max(500, (syl.duration || 1000) + 300))
})

window.addEventListener('load', function () {
    const loadingElement = document.getElementById('loading')
    if (loadingElement) loadingElement.style.display = 'none'
})
if (document.readyState === 'complete') {
    const loadingElement = document.getElementById('loading')
    if (loadingElement) loadingElement.style.display = 'none'
}

if (typeof tippy !== 'undefined') {

    const menuOptions = {
        allowHTML: true,
        trigger: 'click',
        interactive: true,
        animation: 'fade',
        arrow: false,
        theme: 'kmake-dropdown',
        placement: 'bottom-start',
        offset: [0, 2],
    }

    function menuHooks(id) {
        return {
            onShow() { document.getElementById(id)?.setAttribute('data-active', 'true') },
            onHide() { document.getElementById(id)?.removeAttribute('data-active') },
        }
    }

    tippy('#menu-file', {
        ...menuOptions,
        ...menuHooks('menu-file'),
        content: `
        <div class="dropdown-content">
            <button onclick="createNewProject()">
                <i data-lucide="file-plus" class="menu-icon"></i> New Project
            </button>
            <button onclick="importAnyLyricsFile()">
                <i data-lucide="folder-open" class="menu-icon"></i> Import File…
            </button>
            <button onclick="exportKMAKE()">
                <i data-lucide="save" class="menu-icon"></i> Save as .kmake
            </button>
            <div class="dropdown-separator"></div>
            <span class="dropdown-section">Export</span>
            <button onclick="exportNewKpoeJSON()">
                <i data-lucide="braces" class="menu-icon"></i> Export JSON (v2)
                <span class="menu-shortcut">Ctrl+E</span>
            </button>
            <button onclick="exportTTML()">
                <i data-lucide="code-2" class="menu-icon"></i> Export Apple TTML
            </button>
            <button onclick="exportLegacyJSON()">
                <i data-lucide="gamepad-2" class="menu-icon"></i> Export JDNow Lyrics
            </button>
            <button onclick="exportLRC()">
                <i data-lucide="subtitles" class="menu-icon"></i> Export LRC
            </button>
            <button onclick="exportELRC()">
                <i data-lucide="subtitles" class="menu-icon"></i> Export Enhanced LRC
            </button>
        </div>`,
        onMount(instance) { lucide.createIcons({ nodes: [instance.popper] }) },
    })

    tippy('#menu-song', {
        ...menuOptions,
        ...menuHooks('menu-song'),
        content: `
        <div class="dropdown-content">
            <button onclick="openAgentManager()">
                <i data-lucide="users" class="menu-icon"></i> Agents…
            </button>
            <button onclick="openMetadataEditor()">
                <i data-lucide="music" class="menu-icon"></i> Metadata…
            </button>
            <div class="dropdown-separator"></div>
            <button onclick="importSong()">
                <i data-lucide="upload" class="menu-icon"></i> Load Audio File…
            </button>
            <button onclick="importYoutube()">
                <i data-lucide="youtube" class="menu-icon"></i> Load from YouTube…
            </button>

        </div>`,
        onMount(instance) { lucide.createIcons({ nodes: [instance.popper] }) },
    })

    tippy('#menu-tools', {
        ...menuOptions,
        ...menuHooks('menu-tools'),
        content: `
        <div class="dropdown-content">
            <button onclick="openTranslitModal()">
                <i data-lucide="languages" class="menu-icon"></i> Romanization &amp; Translation…
            </button>
            <button onclick="openTimingToolsModal()">
                <i data-lucide="sliders" class="menu-icon"></i> Shift / Scale Timings…
            </button>
            <div class="dropdown-separator"></div>
            <button onclick="applyRepeatedLineTimings()">
                <i data-lucide="copy-check" class="menu-icon"></i> Sync Repeated Chorus / Lines
            </button>
            <button onclick="fixLineGapsAndOverlaps()">
                <i data-lucide="magnet" class="menu-icon"></i> Snap Gaps &amp; Fix Overlaps
            </button>
            <div class="dropdown-separator"></div>
            <button onclick="openQualityAuditModal()">
                <i data-lucide="shield-check" class="menu-icon"></i> Audit Lyrics Quality…
            </button>
        </div>`,
        onMount(instance) { lucide.createIcons({ nodes: [instance.popper] }) },
    })

    tippy('#menu-help', {
        ...menuOptions,
        ...menuHooks('menu-help'),
        content: `
        <div class="dropdown-content">
            <button onclick="openWhatsNewModal()">
                <i data-lucide="file-text" class="menu-icon"></i> What's New in 3.0
            </button>
            <button onclick="startInteractiveWalkthrough()">
                <i data-lucide="compass" class="menu-icon"></i> Interactive Walkthrough
            </button>
            <button onclick="openTutorial()">
                <i data-lucide="book-open" class="menu-icon"></i> Tutorial &amp; Shortcuts
            </button>
            <div class="dropdown-separator"></div>
            <button onclick="openAboutModal()">
                <i data-lucide="info" class="menu-icon"></i> About Kmake
            </button>
            <button onclick="window.open('https://github.com/ibratabian17/kmake')">
                <i data-lucide="github" class="menu-icon"></i> GitHub Repository
            </button>
        </div>`,
        onMount(instance) { lucide.createIcons({ nodes: [instance.popper] }) },
    })
}

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
    if (typeof selectedWordIndices !== 'undefined' && selectedWordIndices.size > 1) {
        const entries = _getSelectedEntries()
        if (!entries.length) return
        pushHistoryState()
        const affectedLines = new Set()
        entries.forEach(e => {
            const wp = _timelineChipMap.get(e.idx)
            const curT = (e.syl.isDone && e.syl.time > 0) ? e.syl.time : (wp ? wp.startMs : 0)
            const curD = (e.syl.isDone && e.syl.duration > 0) ? e.syl.duration : (wp ? wp.durMs : 300)
            if (field === 'start') {
                e.syl.time = Math.max(0, curT + delta)
                if (!e.syl.isDone || !e.syl.duration) e.syl.duration = curD
            } else {
                if (!e.syl.isDone || !e.syl.time) e.syl.time = curT
                e.syl.duration = Math.max(40, curD + delta)
            }
            e.syl.isDone = true
            if (e.syl.element) {
                e.syl.element.classList.add('done-word')
                e.syl.element.style.setProperty('--duration', e.syl.duration + 'ms')
            }
            affectedLines.add(e.line)
        })
        affectedLines.forEach(l => _recalcLineBounds(l))
        renderTimeline()
        _updateMultiSelectionPropertiesUI(_getSelectedEntries())
        if (isPreviewActive()) refreshLyricsPlusPreview()
        return
    }

    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const entry = allSyllables[selectedWordIndex]
    if (!entry || entry.isEndOfLine || entry.lineIdx < 0) return
    const { lineIdx, syllabusIdx } = entry
    const line = tempLyrics[lineIdx]
    const syl = line?.syllabus[syllabusIdx]
    if (!syl) return

    pushHistoryState()
    const inputId = field === 'start' ? 'properties-start' : 'properties-length'
    const input = document.getElementById(inputId)
    if (!input) return

    const newVal = Math.max(0, (parseInt(input.value) || 0) + delta)
    input.value = newVal

    if (field === 'start') {
        syl.time = newVal
        syl.isDone = true
        if (syl.element) syl.element.classList.add('done-word')
    } else {
        syl.duration = newVal
        if (syl.element) syl.element.style.setProperty('--duration', syl.duration + 'ms')
    }

    _recalcLineBounds(line)
    updateTimeDisplays()
    renderTimeline()
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function syncWordToCursor(field) {
    const timeMs = Math.round(player.currentTime * 1000)
    if (typeof selectedWordIndices !== 'undefined' && selectedWordIndices.size > 1) {
        const entries = _getSelectedEntries()
        if (!entries.length) return
        pushHistoryState()
        const snaps = entries.map(e => {
            const wp = _timelineChipMap.get(e.idx)
            const st = (e.syl.isDone && e.syl.time > 0) ? e.syl.time : (wp ? wp.startMs : 0)
            const du = (e.syl.isDone && e.syl.duration > 0) ? e.syl.duration : (wp ? wp.durMs : 300)
            return { e, st, du }
        })
        const minStart = Math.min(...snaps.map(x => x.st))
        const maxEnd = Math.max(...snaps.map(x => x.st + x.du))
        const affectedLines = new Set()

        if (field === 'end') {
            const curSpan = Math.max(60, maxEnd - minStart)
            const targetSpan = Math.max(80, timeMs - minStart)
            const factor = targetSpan / curSpan
            snaps.forEach(({ e, st, du }) => {
                e.syl.time = Math.max(0, Math.round(minStart + (st - minStart) * factor))
                e.syl.duration = Math.max(40, Math.round(du * factor))
                e.syl.isDone = true
                if (e.syl.element) {
                    e.syl.element.classList.add('done-word')
                    e.syl.element.style.setProperty('--duration', e.syl.duration + 'ms')
                }
                affectedLines.add(e.line)
            })
        } else {
            const delta = timeMs - minStart
            snaps.forEach(({ e, st, du }) => {
                e.syl.time = Math.max(0, st + delta)
                e.syl.duration = du
                e.syl.isDone = true
                if (e.syl.element) {
                    e.syl.element.classList.add('done-word')
                    e.syl.element.style.setProperty('--duration', du + 'ms')
                }
                affectedLines.add(e.line)
            })
        }
        affectedLines.forEach(l => _recalcLineBounds(l))
        renderTimeline()
        _updateMultiSelectionPropertiesUI(_getSelectedEntries())
        if (isPreviewActive()) refreshLyricsPlusPreview()
        return
    }

    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const entry = allSyllables[selectedWordIndex]
    if (!entry || entry.isEndOfLine || entry.lineIdx < 0) return
    const { lineIdx, syllabusIdx } = entry
    const line = tempLyrics[lineIdx]
    const syl = line?.syllabus[syllabusIdx]
    if (!syl) return
    pushHistoryState()
    if (field === 'end') {
        const dur = Math.max(30, timeMs - (syl.time || 0))
        const lenIn = document.getElementById('properties-length')
        if (lenIn) lenIn.value = dur
        syl.duration = dur
        syl.isDone = true
        if (syl.element) {
            syl.element.classList.add('done-word')
            syl.element.style.setProperty('--duration', dur + 'ms')
        }
    } else {
        const input = document.getElementById('properties-start')
        if (input) input.value = timeMs
        syl.time = timeMs
        syl.isDone = true
        if (syl.element) syl.element.classList.add('done-word')
    }

    _recalcLineBounds(line)
    updateTimeDisplays()
    renderTimeline()
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function changeSelectedLineAgent(newAlias) {
    const entries = _getSelectedEntries()
    if (!entries.length) return
    pushHistoryState()
    const lineIndices = Array.from(new Set(entries.map(e => e.lineIdx)))
    lineIndices.forEach(li => {
        if (tempLyrics[li] && tempLyrics[li].element) {
            tempLyrics[li].element.singer = newAlias
        }
    })
    _syncLyricsInputFromModel()
    renderTimeline()
    if (isPreviewActive()) refreshLyricsPlusPreview()
}


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
    if (Object.keys(newAgents).length === 0) {
        showToast('At least one agent is required', 3000, 'error')
        return
    }

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


function openAboutModal() {
    const existing = document.getElementById('about-modal')
    if (existing) existing.remove()
    const modal = document.createElement('div')
    modal.id = 'about-modal'
    modal.className = 'kmake-modal'
    modal.innerHTML = `
        <div class="kmake-modal-backdrop" onclick="closeAboutModal()"></div>
        <div class="kmake-modal-content" style="max-width:360px">
            <div class="kmake-modal-header">
                <i data-lucide="info" class="modal-header-icon"></i>
                <h2>About Kmake</h2>
                <button onclick="closeAboutModal()" class="modal-close-btn"><i data-lucide="x"></i></button>
            </div>
            <div class="kmake-modal-body" style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:24px;text-align:center">
                <img src="assets/kmake-logo.png" style="height:32px;opacity:0.9" />
                <div style="display:flex;flex-direction:column;gap:3px">
                    <p style="font-size:0.92rem;font-weight:600;color:var(--md-sys-color-on-surface)">Kmake — JSON Lyrics Generator</p>
                    <p style="font-size:0.76rem;color:var(--md-sys-color-on-surface-variant)">${AppVersion.customName} &nbsp;·&nbsp; v${AppVersion.version}</p>
                </div>
                <div style="width:100%;height:1px;background:var(--md-sys-color-outline-variant)"></div>
                <div style="display:flex;flex-direction:column;gap:4px">
                    <p style="font-size:0.8rem;color:var(--md-sys-color-on-surface-variant)">Originally by <b style="color:var(--md-sys-color-on-surface)">ecnivtwelve</b></p>
                    <p style="font-size:0.76rem;color:var(--md-sys-color-on-surface-variant);opacity:0.6">Fork maintained by Ibratabian17</p>
                </div>
                <button onclick="window.open('https://github.com/ecnivtwelve/kmake')" class="btn-secondary" style="display:flex;align-items:center;gap:6px">
                    <i data-lucide="github" style="width:13px;height:13px"></i> View on GitHub
                </button>
            </div>
        </div>`
    document.body.appendChild(modal)
    requestAnimationFrame(() => { modal.classList.add('visible'); lucide.createIcons() })
}

function closeAboutModal() {
    const modal = document.getElementById('about-modal')
    if (!modal) return
    modal.classList.remove('visible')
    setTimeout(() => modal.remove(), 200)
}


// Uses Google Translate public detect endpoint when metadata.language is unset.
let metadataEverOpened = false
let _pendingExportFn = null

async function detectLanguage() {
    const lines = elem_lyricsInput.value.split('\n')
    const sortedAliases = Object.keys(metadata.agents).sort((a, b) => b.length - a.length)
    const plainLines = lines
        .map(l => l.trim())
        .filter(t => t && !isValidTag(t) && !extractAgentDeclaration(t))
        .map(t => {
            for (const alias of sortedAliases) {
                if (t.startsWith(alias + ':')) return t.slice(alias.length + 1).trim()
            }
            return t
        })
        .map(t => t.replace(/\]/g, ''))
    const sample = plainLines.slice(0, 12).join(' ').substring(0, 400).trim()
    if (!sample) return null
    const res = await fetch(
        'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q='
        + encodeURIComponent(sample)
    )
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    return (Array.isArray(data) && data[2]) ? data[2] : null
}

async function detectAndFillLanguage() {
    const btn = document.getElementById('btn-detect-lang')
    const input = document.getElementById('meta-language')
    if (btn) { btn.disabled = true; btn.textContent = 'Detecting…' }
    try {
        const lang = await detectLanguage()
        if (lang) {
            if (input) input.value = lang
            showToast('Detected language: ' + lang)
        } else {
            showToast('Could not detect — add more lyrics first', 3500, 'error')
        }
    } catch {
        showToast('Detection failed — check connection', 3500, 'error')
    } finally {
        if (btn) {
            btn.disabled = false
            btn.innerHTML = '<i data-lucide="scan-text" style="width:13px;height:13px"></i> Detect'
            if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [btn] })
        }
    }
}

async function _runExport(exportFn) {
    if (!metadata.language) {
        try {
            const lang = await detectLanguage()
            if (lang) metadata.language = lang
        } catch {}
    }
    exportFn()
}

function openMetadataEditor(exportCallback = null) {
    metadataEverOpened = true
    _pendingExportFn = exportCallback
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
                        <div style="display:flex;gap:6px;align-items:center">
                            <input type="text" id="meta-language" value="${escapeHtmlAttr(metadata.language || '')}" placeholder="en, ja, ko…" style="flex:1;min-width:0" />
                            <button id="btn-detect-lang" onclick="detectAndFillLanguage()" class="btn-secondary" title="Auto-detect from lyrics text" style="white-space:nowrap;flex-shrink:0;display:flex;align-items:center;gap:4px">
                                <i data-lucide="scan-text" style="width:13px;height:13px"></i> Detect
                            </button>
                        </div>
                    </div>
                    <div class="meta-field">
                        <label>ISRC</label>
                        <input type="text" id="meta-isrc" value="${escapeHtmlAttr(metadata.isrc || '')}" placeholder="ISRC code" />
                    </div>
                </div>
                <div class="meta-field">
                    <label>Curator</label>
                    <input type="text" id="meta-curator" value="${escapeHtmlAttr(metadata.curator || getSavedCurator())}" placeholder="${escapeHtmlAttr(getSavedCurator())}" />
                </div>
            </div>
            <div class="kmake-modal-footer">
                <button onclick="saveMetadata()" class="btn-primary">${exportCallback ? 'Save & Export' : 'Save'}</button>
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
    const curatorInput = document.getElementById('meta-curator')
    const curatorVal = curatorInput ? curatorInput.value.trim() : ''
    metadata.curator = curatorVal || getSavedCurator()
    saveCurator(metadata.curator)

    const writersRaw = document.getElementById('meta-writers').value.trim()
    metadata.songWriters = writersRaw ? writersRaw.split(',').map(s => s.trim()).filter(Boolean) : []

    const musicTitleEl = document.getElementById('music-title')
    const musicArtistEl = document.getElementById('music-artist')
    const musicAlbumEl = document.getElementById('music-album')
    if (musicTitleEl && metadata.title) musicTitleEl.innerText = metadata.title
    if (musicArtistEl && metadata.artist) musicArtistEl.innerText = metadata.artist
    if (musicAlbumEl && metadata.album) musicAlbumEl.innerText = metadata.album

    if (!filename && metadata.title) {
        filename = metadata.artist ? `${metadata.artist} - ${metadata.title}` : metadata.title
    }

    const cb = _pendingExportFn
    _pendingExportFn = null
    closeMetadataEditor()
    if (cb) { cb() } else { showToast('Metadata saved') }
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
                        <p class="tip">Agent name is <b>optional</b> — <code>[agent:person=v1]</code> is valid. Use <b>Song → Agents</b> to manage this visually!</p>
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
                        <p>Use <code>]</code> to split a word into syllables. Use <code>-</code> only for hyphenated words where the dash belongs in the word:</p>
                        <div class="code-block">v1:Beau]ti]ful
v1:A-ma-zing
v1:Makan-makan</div>
                        <p class="tip">Both create separate timing slots. Prefer <code>]</code> for normal splits.</p>
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


(function initHints() {
    let dismissed = null; try { dismissed = localStorage.getItem('kmake-hint-dismissed') } catch (e) {}
    if (dismissed) return

    const hint = document.createElement('div')
    hint.id = 'kmake-hint-badge'
    hint.className = 'kmake-hint-badge'
    hint.innerHTML = `<i data-lucide="lightbulb" style="width:14px;height:14px;flex-shrink:0"></i><span>New here? Click <b>Help</b> for a guide</span><button onclick="document.getElementById('kmake-hint-badge').remove();localStorage.setItem('kmake-hint-dismissed','1')"><i data-lucide="x" style="width:12px;height:12px"></i></button>`
    function mountHint() {
        const header = document.querySelector('.buttons-actions')
        if (header) header.after(hint)
        else document.body.appendChild(hint)
        if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [hint] })
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountHint)
    } else {
        mountHint()
    }
    setTimeout(() => {
        const el = document.getElementById('kmake-hint-badge')
        if (el) { el.classList.add('fade-out'); setTimeout(() => el?.remove(), 400) }
        try { localStorage.setItem('kmake-hint-dismissed', '1') } catch (e) {}
    }, 8000)
})()


elem_lyricsInput.addEventListener('input', function () {
    const lines = this.value.split('\n')
    const detectedAgents = {}
    lines.forEach(l => {
        const d = extractAgentDeclaration(l.trim())
        if (d) detectedAgents[d.alias] = { type: d.type, name: d.name, alias: d.alias }
    })
    if (Object.keys(detectedAgents).length > 0) {
        Object.assign(metadata.agents, detectedAgents)
    }
})
var currentSettings = window.currentSettings = {
    wordByWord: true,
    blurInactive: true,
    bkgOverlap: true,
    lightweight: false,
    relaxScroll: false,
    hideOffscreen: false,
    useSongPaletteFullscreen: false,
    useSongPaletteAllModes: false,
    overridePaletteColor: '',
    hidePhoneticDup: false,
    transliterationTargetScript: 'romanized'
}

window.t = function (key) {
    const labels = {
        writtenBy: 'Written by:',
        source: 'Source:',
        notFound: 'No lyrics synced yet',
        notFoundError: 'Unable to render lyrics',
        loading: 'Loading...',
        lyricsOptions: 'Lyrics Options',
        refreshLyrics: 'Refresh Lyrics',
        showTranslationOptions: 'Translation Options',
        showTranslation: 'Show Translation',
        hideTranslation: 'Hide Translation',
        showPronunciation: 'Show Pronunciation',
        hidePronunciation: 'Hide Pronunciation',
        showOriginal: 'Show Original',
        hideOriginal: 'Hide Original',
        offsetLyrics: 'Lyrics Offset',
        changeLyricsSource: 'Change Lyrics Source',
        reloadLyrics: 'Reload Lyrics',
        reset: 'Reset to 0ms'
    }
    return labels[key] || key
}

window.isValidLyricsSource = function (source) {
    return Boolean(source && String(source).trim())
}

window.getLyricsProviderContext = function () {
    return {
        providerKeys: ['kmake'],
        activeProvider: 'kmake',
        providerDisplayNames: { kmake: 'Kmake' }
    }
}

window.detectLyricsProviderFromSource = function () {
    return 'kmake'
}

window.saveLyricsOffset = function (songInfo, offsetMs) {
    if (lyricsRendererInstance) lyricsRendererInstance.userOffsetMs = offsetMs
}

window.LYPLUS_getSongPalette = function () {
    return { r: 211, g: 188, b: 253 }
}

const DEFAULT_SHORTCUTS = {
    stampWord: 'Enter',
    endWord: 'Shift+Enter',
    stepBack: 'Backspace',
    playPause: 'Space',
    prevWord: 'ArrowLeft',
    nextWordNav: 'ArrowRight',
    toggleBg: 'B',
    tlFollow: 'F',
    tlRolling: 'R',
    tlSnap: 'T'
}

let userShortcuts = { ...DEFAULT_SHORTCUTS }
try {
    const savedSc = localStorage.getItem('kmake_shortcuts_v1')
    if (savedSc) Object.assign(userShortcuts, JSON.parse(savedSc))
} catch (e) {}

const DEFAULT_EDITOR_SETTINGS = {
    showSyllableIndicators: true,
    autoExtractBg: true,
    preserveBgBrackets: true,
    allowSpaceDoubleBracketEndWord: false,
    previewBlurredArt: true,
    tapLatencyMs: 0,
    holdThresholdMs: 180,
    rewindOffsetSec: 1.2,
    snapStepMs: 25,
    warnOnClose: true,
    confirmReset: true,
    autoSaveDraft: true
}

let editorSettings = { ...DEFAULT_EDITOR_SETTINGS }
try {
    const savedEs = localStorage.getItem('kmake_editor_settings_v1')
    if (savedEs) Object.assign(editorSettings, JSON.parse(savedEs))
} catch (e) {}

let hasUnsavedChanges = false
let _recordingShortcutKey = null
let _activeSettingsCategory = 'general'
let _memoryProjectsList = []
let _idbInstance = null
let _autoSaveTimer = null
let selectedWordIndices = new Set()
let _timelineChipMap = new Map()

const DEFAULT_ARTWORK_SVG_URI = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">' +
    '<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">' +
    '<stop offset="0%" stop-color="#4f378b"/><stop offset="50%" stop-color="#31111d"/><stop offset="100%" stop-color="#1d192b"/>' +
    '</linearGradient></defs><rect width="400" height="400" fill="url(#g)"/>' +
    '<circle cx="120" cy="130" r="110" fill="#d3bcfd" opacity="0.22"/>' +
    '<circle cx="290" cy="280" r="130" fill="#efb8c8" opacity="0.18"/>' +
    '</svg>'
)

function _openIDB() {
    return new Promise((resolve) => {
        if (_idbInstance) {
            resolve(_idbInstance)
            return
        }
        if (typeof indexedDB === 'undefined') {
            resolve(null)
            return
        }
        try {
            const req = indexedDB.open('kmake_idb_v1', 1)
            req.onupgradeneeded = function (e) {
                const db = e.target.result
                if (!db.objectStoreNames.contains('projects')) {
                    db.createObjectStore('projects', { keyPath: 'id' })
                }
            }
            req.onsuccess = function (e) {
                _idbInstance = e.target.result
                resolve(_idbInstance)
            }
            req.onerror = function () {
                resolve(null)
            }
        } catch (e) {
            resolve(null)
        }
    })
}

function _idbPutProject(projRecord) {
    _openIDB().then(db => {
        if (!db) return
        try {
            const tx = db.transaction('projects', 'readwrite')
            tx.objectStore('projects').put(projRecord)
        } catch (e) {}
    })
}

function _idbGetProject(projId) {
    return _openIDB().then(db => {
        if (!db) return null
        return new Promise((resolve) => {
            try {
                const tx = db.transaction('projects', 'readonly')
                const req = tx.objectStore('projects').get(projId)
                req.onsuccess = () => resolve(req.result || null)
                req.onerror = () => resolve(null)
            } catch (e) {
                resolve(null)
            }
        })
    })
}

function _idbGetAllProjects() {
    return _openIDB().then(db => {
        if (!db) return []
        return new Promise((resolve) => {
            try {
                const tx = db.transaction('projects', 'readonly')
                const req = tx.objectStore('projects').getAll()
                req.onsuccess = () => {
                    const arr = Array.isArray(req.result) ? req.result : []
                    arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                    resolve(arr)
                }
                req.onerror = () => resolve([])
            } catch (e) {
                resolve([])
            }
        })
    })
}

function _idbDeleteProject(projId) {
    _openIDB().then(db => {
        if (!db) return
        try {
            const tx = db.transaction('projects', 'readwrite')
            tx.objectStore('projects').delete(projId)
        } catch (e) {}
    })
}

function _idbClearAllProjects() {
    _openIDB().then(db => {
        if (!db) return
        try {
            const tx = db.transaction('projects', 'readwrite')
            tx.objectStore('projects').clear()
        } catch (e) {}
    })
}

function _saveUserShortcuts() {
    try { localStorage.setItem('kmake_shortcuts_v1', JSON.stringify(userShortcuts)) } catch (e) {}
    _refreshShortcutLabelsUI()
}

function _saveEditorSettings() {
    try { localStorage.setItem('kmake_editor_settings_v1', JSON.stringify(editorSettings)) } catch (e) {}
}

function _eventToCombo(e) {
    const parts = []
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')
    let key = e.key
    if (key === ' ' || e.code === 'Space') key = 'Space'
    else if (key && key.length === 1) key = key.toUpperCase()
    if (key && !['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
        parts.push(key)
    }
    return parts.join('+')
}

function _matchesShortcut(e, actionId) {
    const target = userShortcuts[actionId] || DEFAULT_SHORTCUTS[actionId]
    if (!target) return false
    return _eventToCombo(e).toLowerCase() === target.toLowerCase()
}

function _refreshShortcutLabelsUI() {
    const setLbl = (id, val, paren = true) => {
        const el = document.getElementById(id)
        if (el) el.textContent = paren ? `(${val})` : val
    }
    setLbl('lbl-key-stamp', userShortcuts.stampWord, true)
    setLbl('lbl-key-back', userShortcuts.stepBack, true)
}

function _getSavedProjectsList() {
    try {
        const raw = localStorage.getItem('kmake_projects_list_v1')
        if (raw) {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed)) {
                _memoryProjectsList = parsed
                return parsed
            }
        }
    } catch (e) {}
    return _memoryProjectsList.slice()
}

function _saveProjectsList(list) {
    const liteList = list.slice(0, 30).map(p => {
        const copy = { ...p }
        delete copy.audioBlob
        return copy
    })
    _memoryProjectsList = liteList
    try {
        localStorage.setItem('kmake_projects_list_v1', JSON.stringify(liteList))
    } catch (e) {
        // Fallback for localStorage quota limits: strip bulky syllable/plaintext data from localStorage
        // because full project records and audio are safely stored in IndexedDB.
        try {
            const compactList = liteList.map(p => {
                const c = { ...p }
                delete c.tempLyrics
                delete c.plainText
                return c
            })
            localStorage.setItem('kmake_projects_list_v1', JSON.stringify(compactList))
        } catch (err) {
            console.warn('Could not save projects list to localStorage', err)
        }
    }
}

function saveCurrentProjectToStorage() {
    const rawInputText = elem_lyricsInput ? elem_lyricsInput.value : ''
    const lyricLines = tempLyrics.filter(l => l && !l.isTaggedLine && (l.text || '').trim())
    const hasAudio = Boolean(music_file || currentYoutubeId)
    if (lyricLines.length === 0 && !rawInputText.trim() && !hasAudio && !metadata.title) return

    const list = _getSavedProjectsList()
    const totalSyls = allSyllables.filter(a => !a.isEndOfLine).length
    let syncedSyls = 0
    allSyllables.forEach(a => {
        if (!a.isEndOfLine) {
            const s = tempLyrics[a.lineIdx]?.syllabus[a.syllabusIdx]
            if (s && s.isDone && s.time > 0) syncedSyls++
        }
    })

    const rawLinesFallback = rawInputText.trim()
        ? rawInputText.split('\n').filter(l => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('[agent:')).length
        : 0

    const artEl = document.getElementById('music-album-art')
    const artSrc = (artEl && artEl.getAttribute('src')) ? artEl.getAttribute('src') : ''

    const projEntry = {
        id: currentProjectId,
        updatedAt: Date.now(),
        title: metadata.title || document.getElementById('music-title')?.innerText || 'Untitled Project',
        artist: metadata.artist || document.getElementById('music-artist')?.innerText || 'Unknown Artist',
        album: metadata.album || document.getElementById('music-album')?.innerText || '',
        artSrc: artSrc,
        currentYoutubeId: currentYoutubeId || '',
        audioName: music_file ? music_file.name : '',
        lineCount: lyricLines.length || rawLinesFallback,
        totalSyls,
        syncedSyls,
        currentWordIndex,
        selectedWordIndex,
        metadata: JSON.parse(JSON.stringify(metadata)),
        plainText: rawInputText,
        tempLyrics: tempLyrics.map(l => ({
            time: l.time,
            duration: l.duration,
            text: l.text,
            translatedText: l.translatedText,
            romanizedText: l.romanizedText,
            isTaggedLine: l.isTaggedLine,
            tag: l.tag,
            lineIndex: l.lineIndex,
            element: l.element ? { ...l.element } : {},
            syllabus: (l.syllabus || []).map(s => ({
                time: s.time,
                duration: s.duration,
                text: s.text,
                isDone: s.isDone,
                isBackground: s.isBackground,
                romanizedText: s.romanizedText
            }))
        }))
    }

    const existingIdx = list.findIndex(p => p.id === currentProjectId)
    if (existingIdx !== -1) {
        list.splice(existingIdx, 1)
    }
    list.unshift(projEntry)
    _saveProjectsList(list)

    const idbRecord = { ...projEntry, audioBlob: music_file || null }
    _idbPutProject(idbRecord)
    hasUnsavedChanges = false
}

function _markDirtyAndAutoSave() {
    hasUnsavedChanges = true
    if (!editorSettings.autoSaveDraft) return
    if (_autoSaveTimer) clearTimeout(_autoSaveTimer)
    _autoSaveTimer = setTimeout(() => {
        saveCurrentProjectToStorage()
    }, 1200)
}

elem_lyricsInput?.addEventListener('input', function () {
    _markDirtyAndAutoSave()
})

window.addEventListener('beforeunload', function (e) {
    if (editorSettings.autoSaveDraft) {
        saveCurrentProjectToStorage()
    }
    if (editorSettings.warnOnClose && hasUnsavedChanges && tempLyrics.length > 0) {
        e.preventDefault()
        e.returnValue = ''
        return ''
    }
})

function _arrayBufferToBase64(data) {
    if (!data) return ''
    const bytes = new Uint8Array(data)
    let binary = ''
    const chunk = 8192
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)))
    }
    return btoa(binary)
}

function _syllabusToMarkup(syllabus, fallbackText) {
    if (!syllabus || !syllabus.length) return fallbackText || ''
    let out = ''
    for (let i = 0; i < syllabus.length; i++) {
        const raw = syllabus[i].text || ''
        if (raw === ']') {
            out += ']'
            continue
        }
        const txt = raw.replace(/]/g, '')
        out += txt
        if (i < syllabus.length - 1 && !txt.endsWith(' ') && !txt.endsWith('-')) {
            out += ']'
        }
    }
    return out
}

function _recalcLineBounds(line) {
    if (!line || line.isTaggedLine || !line.syllabus) return
    const doneSyls = line.syllabus.filter(s => s.isDone && s.time > 0)
    if (doneSyls.length > 0) {
        line.time = Math.min(...doneSyls.map(s => s.time))
        const maxEnd = Math.max(...doneSyls.map(s => s.time + (s.duration || 0)))
        line.duration = Math.max(0, maxEnd - line.time)
    } else {
        line.time = 0
        line.duration = 0
    }
}

function _syncLyricsInputFromModel() {
    const out = []
    for (const alias in metadata.agents) {
        const ag = metadata.agents[alias]
        out.push(ag.name ? `[agent:${ag.type}=${alias}:${ag.name}]` : `[agent:${ag.type}=${alias}]`)
    }
    if (out.length > 0) out.push('')

    let prevPartIdx = -1
    tempLyrics.forEach(line => {
        if (!line) return
        if (line.isTaggedLine) {
            if (line.tag && line.tag !== 'ENDOFLINE') {
                out.push('#' + line.tag)
                prevPartIdx = line.element?.songPartIndex ?? prevPartIdx
            }
            return
        }
        const partIdx = line.element?.songPartIndex ?? -1
        if (partIdx >= 0 && partIdx !== prevPartIdx && metadata.songParts[partIdx] && metadata.songParts[partIdx].name) {
            out.push('#' + metadata.songParts[partIdx].name)
            prevPartIdx = partIdx
        }
        if ((line.text || '').replace(/]/g, '').trim() === '') {
            out.push('')
            return
        }
        const singer = line.element?.singer || 'v1'
        const markup = _syllabusToMarkup(line.syllabus, line.text)
        out.push(`${singer}:${markup}`)
    })
    elem_lyricsInput.value = out.join('\n')
}

function _getSelectedEntries() {
    if (selectedWordIndices.size > 0) {
        const arr = Array.from(selectedWordIndices)
            .filter(i => i >= 0 && i < allSyllables.length && !allSyllables[i]?.isEndOfLine)
            .sort((a, b) => a - b)
        return arr.map(idx => {
            const entry = allSyllables[idx]
            const line = tempLyrics[entry.lineIdx]
            const syl = line?.syllabus[entry.syllabusIdx]
            return { idx, lineIdx: entry.lineIdx, syllabusIdx: entry.syllabusIdx, line, syl }
        }).filter(x => x.line && x.syl)
    }
    if (selectedWordIndex >= 0 && selectedWordIndex < allSyllables.length) {
        const entry = allSyllables[selectedWordIndex]
        if (entry && !entry.isEndOfLine) {
            const line = tempLyrics[entry.lineIdx]
            const syl = line?.syllabus[entry.syllabusIdx]
            if (line && syl) return [{ idx: selectedWordIndex, lineIdx: entry.lineIdx, syllabusIdx: entry.syllabusIdx, line, syl }]
        }
    }
    return []
}

function setMultiWordSelection(indicesArray, primaryIdx) {
    const valid = Array.from(new Set(indicesArray))
        .filter(i => i >= 0 && i < allSyllables.length && !allSyllables[i]?.isEndOfLine)
        .sort((a, b) => a - b)

    if (valid.length === 0) {
        unselect()
        return
    }
    if (valid.length === 1) {
        selectedWordIndices = new Set(valid)
        openWord(valid[0])
        return
    }

    selectedWordIndices = new Set(valid)
    selectedWordIndex = (primaryIdx != null && selectedWordIndices.has(primaryIdx)) ? primaryIdx : valid[0]
    currentWordIndex = selectedWordIndex

    document.querySelectorAll('.opened-word').forEach(el => el.classList.remove('opened-word'))
    const entries = _getSelectedEntries()
    entries.forEach(item => {
        if (item.syl.element) item.syl.element.classList.add('opened-word')
    })

    const primarySyl = tempLyrics[allSyllables[selectedWordIndex].lineIdx]?.syllabus[allSyllables[selectedWordIndex].syllabusIdx]
    const prevCurrent = document.querySelector('.current-word')
    if (prevCurrent) prevCurrent.classList.remove('current-word')
    if (primarySyl?.element) primarySyl.element.classList.add('current-word')

    _updateMultiSelectionPropertiesUI(entries)
    refreshWordActionButtons()
    renderTimelineSelection()
}

function _updateMultiSelectionPropertiesUI(entries) {
    if (!entries || !entries.length) return
    const wordLabel = document.getElementById('props-word-label')
    const wordText = document.getElementById('properties-word')
    const multiRetime = document.getElementById('props-multi-retime')
    const sylRomWrap = document.getElementById('props-syl-rom-wrap')

    if (entries.length === 1) {
        if (wordLabel) wordLabel.textContent = 'WORD'
        if (multiRetime) multiRetime.style.display = 'none'
        if (sylRomWrap) sylRomWrap.style.display = ''
        return
    }

    if (wordLabel) wordLabel.textContent = `${entries.length} WORDS`
    if (multiRetime) multiRetime.style.display = 'flex'
    if (sylRomWrap) sylRomWrap.style.display = 'none'

    const previewWords = entries.slice(0, 5).map(e => (e.syl.text || '').replace(/]/g, '').trim() || '♪').join(' · ')
    if (wordText) {
        wordText.innerText = entries.length > 5 ? `${previewWords} (+${entries.length - 5})` : previewWords
    }

    const times = entries.map(e => {
        if (e.syl.isDone && e.syl.time > 0) return { start: e.syl.time, end: e.syl.time + (e.syl.duration || 300) }
        const wp = _timelineChipMap.get(e.idx)
        return { start: wp ? wp.startMs : 0, end: wp ? (wp.startMs + wp.durMs) : 300 }
    })
    const minStart = Math.min(...times.map(t => t.start))
    const maxEnd = Math.max(...times.map(t => t.end))
    const spanMs = Math.max(0, maxEnd - minStart)

    const stEl = document.getElementById('properties-start')
    const lnEl = document.getElementById('properties-length')
    if (stEl) stEl.value = Math.round(minStart)
    if (lnEl) lnEl.value = Math.round(spanMs)
    updateTimeDisplays()

    const lineIndices = Array.from(new Set(entries.map(e => e.lineIdx)))
    const firstLine = tempLyrics[lineIndices[0]]
    const lineTextEl = document.getElementById('properties-line-text')
    if (lineTextEl) {
        if (lineIndices.length === 1) {
            lineTextEl.textContent = (firstLine?.text || '').trim() || '(empty line)'
        } else {
            lineTextEl.textContent = `${lineIndices.length} lines selected (${(firstLine?.text || '').trim().slice(0, 24)}…)`
        }
    }

    const agentSel = document.getElementById('properties-line-agent')
    if (agentSel && firstLine) {
        agentSel.innerHTML = ''
        Object.entries(metadata.agents).forEach(([alias, agent]) => {
            const opt = document.createElement('option')
            opt.value = alias
            opt.textContent = agent.name ? `${alias} — ${agent.name}` : alias
            if (alias === (firstLine.element?.singer || 'v1')) opt.selected = true
            agentSel.appendChild(opt)
        })
    }

    const lRom = document.getElementById('properties-line-romanized')
    if (lRom && firstLine) lRom.value = firstLine.romanizedText || ''
    const lTr = document.getElementById('properties-line-translated')
    if (lTr && firstLine) lTr.value = firstLine.translatedText || ''

    const empty = document.getElementById('props-empty')
    const filled = document.getElementById('props-filled')
    if (empty) empty.style.display = 'none'
    if (filled) filled.style.display = 'flex'
}

function selectAllTimelineWords() {
    const allIndices = []
    for (let i = 0; i < allSyllables.length; i++) {
        if (!allSyllables[i]?.isEndOfLine) allIndices.push(i)
    }
    if (allIndices.length === 0) return
    setMultiWordSelection(allIndices, allIndices[0])
}

function selectCurrentLineWords() {
    const entries = _getSelectedEntries()
    let targetLineIndices = entries.map(e => e.lineIdx)
    if (targetLineIndices.length === 0) {
        const firstLyricIdx = tempLyrics.findIndex(l => l && !l.isTaggedLine)
        if (firstLyricIdx !== -1) targetLineIndices = [firstLyricIdx]
    }
    const lineSet = new Set(targetLineIndices)
    const indices = []
    for (let i = 0; i < allSyllables.length; i++) {
        const a = allSyllables[i]
        if (a && !a.isEndOfLine && lineSet.has(a.lineIdx)) {
            indices.push(i)
        }
    }
    if (indices.length > 0) {
        setMultiWordSelection(indices, indices[0])
    }
}

function selectFromHereOnward() {
    const startIdx = selectedWordIndex >= 0 ? selectedWordIndex : 0
    const indices = []
    for (let i = startIdx; i < allSyllables.length; i++) {
        if (!allSyllables[i]?.isEndOfLine) indices.push(i)
    }
    if (indices.length > 0) {
        setMultiWordSelection(indices, indices[0])
    }
}

function selectTimelineLine(lineIdx, isToggle, isRange) {
    const lineSyllableIndices = []
    for (let i = 0; i < allSyllables.length; i++) {
        const a = allSyllables[i]
        if (a && !a.isEndOfLine && a.lineIdx === lineIdx) {
            lineSyllableIndices.push(i)
        }
    }
    if (lineSyllableIndices.length === 0) return

    if (isRange && selectedWordIndex >= 0 && allSyllables[selectedWordIndex]) {
        const anchorLineIdx = allSyllables[selectedWordIndex].lineIdx
        const minL = Math.min(anchorLineIdx, lineIdx)
        const maxL = Math.max(anchorLineIdx, lineIdx)
        const rangeIndices = []
        for (let i = 0; i < allSyllables.length; i++) {
            const a = allSyllables[i]
            if (a && !a.isEndOfLine && a.lineIdx >= minL && a.lineIdx <= maxL) {
                rangeIndices.push(i)
            }
        }
        setMultiWordSelection(rangeIndices, selectedWordIndex)
        return
    }

    if (isToggle) {
        const nextSet = new Set(selectedWordIndices)
        const allPresent = lineSyllableIndices.every(idx => nextSet.has(idx))
        if (allPresent) {
            lineSyllableIndices.forEach(idx => nextSet.delete(idx))
        } else {
            lineSyllableIndices.forEach(idx => nextSet.add(idx))
        }
        setMultiWordSelection(Array.from(nextSet), lineSyllableIndices[0])
        return
    }

    setMultiWordSelection(lineSyllableIndices, lineSyllableIndices[0])
}

function scaleSelectedWordsTiming(factor) {
    const entries = _getSelectedEntries()
    if (entries.length === 0) return
    pushHistoryState()

    if (entries.length === 1) {
        const s = entries[0].syl
        const origDur = (s.isDone && s.duration > 0) ? s.duration : (_timelineChipMap.get(entries[0].idx)?.durMs || 350)
        if (!s.isDone || !s.time) s.time = _timelineChipMap.get(entries[0].idx)?.startMs || Math.round(player.currentTime * 1000)
        s.duration = Math.max(40, Math.round(origDur * factor))
        s.isDone = true
        if (s.element) {
            s.element.classList.add('done-word')
            s.element.style.setProperty('--duration', s.duration + 'ms')
        }
        _recalcLineBounds(entries[0].line)
        openWord(entries[0].idx)
        renderTimeline()
        if (isPreviewActive()) refreshLyricsPlusPreview()
        return
    }

    const snaps = entries.map(e => {
        const wp = _timelineChipMap.get(e.idx)
        const start = (e.syl.isDone && e.syl.time > 0) ? e.syl.time : (wp ? wp.startMs : 0)
        const dur = (e.syl.isDone && e.syl.duration > 0) ? e.syl.duration : (wp ? wp.durMs : 320)
        return { e, start, dur }
    })
    const anchorStart = Math.min(...snaps.map(x => x.start))
    const affectedLines = new Set()

    snaps.forEach(({ e, start, dur }) => {
        const newStart = Math.max(0, Math.round(anchorStart + (start - anchorStart) * factor))
        const newDur = Math.max(40, Math.round(dur * factor))
        e.syl.time = newStart
        e.syl.duration = newDur
        e.syl.isDone = true
        if (e.syl.element) {
            e.syl.element.classList.add('done-word')
            e.syl.element.style.setProperty('--duration', newDur + 'ms')
        }
        affectedLines.add(e.line)
    })

    affectedLines.forEach(l => _recalcLineBounds(l))
    renderTimeline()
    _updateMultiSelectionPropertiesUI(_getSelectedEntries())
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function distributeSelectedWordsEvenly() {
    const entries = _getSelectedEntries()
    if (entries.length <= 1) {
        autoDistributeSelectedLine()
        return
    }
    pushHistoryState()
    const snaps = entries.map(e => {
        const wp = _timelineChipMap.get(e.idx)
        const start = (e.syl.isDone && e.syl.time > 0) ? e.syl.time : (wp ? wp.startMs : 0)
        const dur = (e.syl.isDone && e.syl.duration > 0) ? e.syl.duration : (wp ? wp.durMs : 320)
        return { e, start, end: start + dur }
    })
    const minStart = Math.min(...snaps.map(x => x.start))
    const maxEnd = Math.max(...snaps.map(x => x.end))
    const totalDur = Math.max(entries.length * 160, maxEnd - minStart)
    const weights = entries.map(e => Math.max(1, (e.syl.text || '').replace(/]/g, '').trim().length))
    const weightSum = weights.reduce((a, b) => a + b, 0) || entries.length

    let cursor = minStart
    const affectedLines = new Set()
    entries.forEach((e, i) => {
        const dur = Math.max(60, Math.round(totalDur * (weights[i] / weightSum)))
        e.syl.time = cursor
        e.syl.duration = dur
        e.syl.isDone = true
        if (e.syl.element) {
            e.syl.element.classList.add('done-word')
            e.syl.element.style.setProperty('--duration', dur + 'ms')
        }
        cursor += dur
        affectedLines.add(e.line)
    })

    affectedLines.forEach(l => _recalcLineBounds(l))
    renderTimeline()
    _updateMultiSelectionPropertiesUI(_getSelectedEntries())
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function snapSelectedWordsGaps() {
    const entries = _getSelectedEntries()
    if (entries.length <= 1) {
        fixLineGapsAndOverlaps()
        return
    }
    pushHistoryState()
    const affectedLines = new Set()
    for (let i = 0; i < entries.length - 1; i++) {
        const cur = entries[i]
        const nxt = entries[i + 1]
        if (cur.lineIdx !== nxt.lineIdx) continue
        if (cur.syl.isBackground !== nxt.syl.isBackground) continue
        const wpCur = _timelineChipMap.get(cur.idx)
        const wpNxt = _timelineChipMap.get(nxt.idx)
        const curStart = (cur.syl.isDone && cur.syl.time > 0) ? cur.syl.time : (wpCur?.startMs || 0)
        const curDur = (cur.syl.isDone && cur.syl.duration > 0) ? cur.syl.duration : (wpCur?.durMs || 300)
        const nxtStart = (nxt.syl.isDone && nxt.syl.time > 0) ? nxt.syl.time : (wpNxt?.startMs || (curStart + curDur))
        if (nxtStart > curStart) {
            cur.syl.time = curStart
            cur.syl.duration = Math.max(40, nxtStart - curStart)
            cur.syl.isDone = true
            if (cur.syl.element) {
                cur.syl.element.classList.add('done-word')
                cur.syl.element.style.setProperty('--duration', cur.syl.duration + 'ms')
            }
            affectedLines.add(cur.line)
        }
    }
    affectedLines.forEach(l => _recalcLineBounds(l))
    renderTimeline()
    _updateMultiSelectionPropertiesUI(_getSelectedEntries())
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function pushHistoryState() {
    if (_isRestoringHistory) return
    const snap = {
        tempLyrics: tempLyrics.map(l => ({
            time: l.time,
            duration: l.duration,
            text: l.text,
            translatedText: l.translatedText,
            romanizedText: l.romanizedText,
            isTaggedLine: l.isTaggedLine,
            tag: l.tag,
            lineIndex: l.lineIndex,
            element: l.element ? { ...l.element } : {},
            syllabus: (l.syllabus || []).map(s => ({
                time: s.time,
                duration: s.duration,
                text: s.text,
                isDone: s.isDone,
                isBackground: s.isBackground,
                romanizedText: s.romanizedText
            }))
        })),
        metadata: JSON.parse(JSON.stringify(metadata)),
        currentWordIndex,
        selectedWordIndex,
        selectedWordIndices: Array.from(selectedWordIndices),
        plainText: elem_lyricsInput.value
    }
    undoStack.push(snap)
    if (undoStack.length > 40) undoStack.shift()
    redoStack = []
    _markDirtyAndAutoSave()
}

function _restoreSnap(snap) {
    _isRestoringHistory = true
    try {
        tempLyrics = snap.tempLyrics
        metadata = snap.metadata
        currentWordIndex = snap.currentWordIndex
        selectedWordIndex = snap.selectedWordIndex
        elem_lyricsInput.value = snap.plainText
        rebuildLyricsDOM()
        buildAllSyllables()
        renderTimeline()
        if (snap.selectedWordIndices && snap.selectedWordIndices.length > 1) {
            setMultiWordSelection(snap.selectedWordIndices, snap.selectedWordIndex)
        } else if (selectedWordIndex >= 0 && selectedWordIndex < allSyllables.length) {
            openWord(selectedWordIndex)
        } else {
            unselect()
        }
        if (isPreviewActive()) refreshLyricsPlusPreview()
        _markDirtyAndAutoSave()
    } finally {
        _isRestoringHistory = false
    }
}

function undo() {
    if (!undoStack.length) return
    const cur = {
        tempLyrics: tempLyrics.map(l => ({
            time: l.time,
            duration: l.duration,
            text: l.text,
            translatedText: l.translatedText,
            romanizedText: l.romanizedText,
            isTaggedLine: l.isTaggedLine,
            tag: l.tag,
            lineIndex: l.lineIndex,
            element: l.element ? { ...l.element } : {},
            syllabus: (l.syllabus || []).map(s => ({
                time: s.time,
                duration: s.duration,
                text: s.text,
                isDone: s.isDone,
                isBackground: s.isBackground,
                romanizedText: s.romanizedText
            }))
        })),
        metadata: JSON.parse(JSON.stringify(metadata)),
        currentWordIndex,
        selectedWordIndex,
        selectedWordIndices: Array.from(selectedWordIndices),
        plainText: elem_lyricsInput.value
    }
    redoStack.push(cur)
    _restoreSnap(undoStack.pop())
}

function redo() {
    if (!redoStack.length) return
    const cur = {
        tempLyrics: tempLyrics.map(l => ({
            time: l.time,
            duration: l.duration,
            text: l.text,
            translatedText: l.translatedText,
            romanizedText: l.romanizedText,
            isTaggedLine: l.isTaggedLine,
            tag: l.tag,
            lineIndex: l.lineIndex,
            element: l.element ? { ...l.element } : {},
            syllabus: (l.syllabus || []).map(s => ({
                time: s.time,
                duration: s.duration,
                text: s.text,
                isDone: s.isDone,
                isBackground: s.isBackground,
                romanizedText: s.romanizedText
            }))
        })),
        metadata: JSON.parse(JSON.stringify(metadata)),
        currentWordIndex,
        selectedWordIndex,
        selectedWordIndices: Array.from(selectedWordIndices),
        plainText: elem_lyricsInput.value
    }
    undoStack.push(cur)
    _restoreSnap(redoStack.pop())
}

function endCurrentWord() {
    const idx = selectedWordIndex !== -1 ? selectedWordIndex : (currentWordIndex - 1)
    if (idx < 0 || idx >= allSyllables.length) return
    const entry = allSyllables[idx]
    if (!entry || entry.isEndOfLine) return
    const line = tempLyrics[entry.lineIdx]
    const syl = line?.syllabus[entry.syllabusIdx]
    if (!syl || !syl.time) return
    pushHistoryState()
    const nowMs = Math.round(player.currentTime * 1000)
    syl.duration = Math.max(40, nowMs - syl.time)
    syl.isDone = true
    if (syl.element) {
        syl.element.style.setProperty('--duration', syl.duration + 'ms')
        syl.element.classList.add('done-word')
    }
    _recalcLineBounds(line)
    if (selectedWordIndex === idx) {
        const lenIn = document.getElementById('properties-length')
        if (lenIn) lenIn.value = syl.duration
        updateTimeDisplays()
    }
    renderTimeline()
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function stepBackWord() {
    if (currentWordIndex <= 0) return
    pushHistoryState()
    currentWordIndex--
    const entry = allSyllables[currentWordIndex]
    if (entry && !entry.isEndOfLine) {
        const line = tempLyrics[entry.lineIdx]
        const syl = line?.syllabus[entry.syllabusIdx]
        if (syl) {
            const rw = editorSettings.rewindOffsetSec || 1.2
            const seekTargetSec = syl.time > 0 ? Math.max(0, (syl.time / 1000) - rw) : Math.max(0, player.currentTime - rw)
            syl.time = 0
            syl.duration = 0
            syl.isDone = false
            if (syl.element) {
                syl.element.classList.remove('done-word', 'playing-word')
                document.querySelectorAll('.current-word').forEach(el => el.classList.remove('current-word'))
                syl.element.classList.add('current-word')
            }
            _recalcLineBounds(line)
            player.currentTime = seekTargetSec
        }
    }
    renderTimeline()
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function promptSplitWord() {
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const entry = allSyllables[selectedWordIndex]
    if (!entry || entry.isEndOfLine) return
    const { lineIdx, syllabusIdx } = entry
    const line = tempLyrics[lineIdx]
    const syl = line?.syllabus[syllabusIdx]
    if (!syl) return
    const raw = (syl.text || '').replace(/]/g, '')
    const trailMatch = raw.match(/\s+$/)
    const trail = trailMatch ? trailMatch[0] : ''
    const core = raw.trim()
    if (core.length <= 1) return

    const mid = Math.ceil(core.length / 2)
    const suggested = core.slice(0, mid) + ']' + core.slice(mid)
    const input = prompt('Insert ] where the word splits into syllables:', suggested)
    if (!input || !input.includes(']')) return

    const parts = input.split(']').filter(Boolean)
    if (parts.length < 2) return

    pushHistoryState()
    const totalDur = syl.duration || 0
    const totalLen = parts.reduce((a, p) => a + p.length, 0) || parts.length
    let curTime = syl.time || 0
    const newSyls = parts.map((p, i) => {
        const isLast = i === parts.length - 1
        const dur = totalDur > 0 ? Math.round(totalDur * (p.length / totalLen)) : 0
        const item = {
            time: syl.isDone ? curTime : 0,
            duration: dur,
            text: isLast ? (p + trail) : p,
            isDone: syl.isDone,
            isBackground: syl.isBackground,
            element: null
        }
        curTime += dur
        return item
    })

    line.syllabus.splice(syllabusIdx, 1, ...newSyls)
    line.text = line.syllabus.map(s => (s.text || '').replace(/]/g, '')).join('')
    _recalcLineBounds(line)
    _syncLyricsInputFromModel()
    _resyncAfterStructuralChange(lineIdx, syllabusIdx)
    renderTimeline()
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function mergeSelectedWithNext() {
    const entries = _getSelectedEntries()
    if (entries.length > 1) {
        const byLine = new Map()
        entries.forEach(e => {
            if (!byLine.has(e.lineIdx)) byLine.set(e.lineIdx, [])
            byLine.get(e.lineIdx).push(e.syllabusIdx)
        })
        let mergedAny = false
        pushHistoryState()
        let firstTargetLine = -1
        let firstTargetSyl = 0
        byLine.forEach((sIndices, lIdx) => {
            if (sIndices.length < 2) return
            const line = tempLyrics[lIdx]
            if (!line || !line.syllabus) return
            const minSi = Math.min(...sIndices)
            const maxSi = Math.max(...sIndices)
            if (maxSi <= minSi) return
            const slice = line.syllabus.slice(minSi, maxSi + 1)
            const doneSlice = slice.filter(s => s.isDone && s.time > 0)
            const start = doneSlice.length > 0 ? Math.min(...doneSlice.map(s => s.time)) : 0
            const maxEnd = doneSlice.length > 0 ? Math.max(...doneSlice.map(s => s.time + (s.duration || 0))) : 0
            const combined = {
                time: start,
                duration: Math.max(0, maxEnd - start),
                text: slice.map(s => (s.text || '').replace(/]/g, '')).join(''),
                isDone: doneSlice.length > 0,
                isBackground: slice.every(s => s.isBackground),
                romanizedText: slice.some(s => s.romanizedText) ? slice.map(s => s.romanizedText || (s.text || '').replace(/]/g, '')).join('') : undefined,
                element: null
            }
            line.syllabus.splice(minSi, maxSi - minSi + 1, combined)
            line.text = line.syllabus.map(s => (s.text || '').replace(/]/g, '')).join('')
            _recalcLineBounds(line)
            if (firstTargetLine === -1) {
                firstTargetLine = lIdx
                firstTargetSyl = minSi
            }
            mergedAny = true
        })
        if (mergedAny) {
            _syncLyricsInputFromModel()
            _resyncAfterStructuralChange(firstTargetLine, firstTargetSyl)
            renderTimeline()
            if (isPreviewActive()) refreshLyricsPlusPreview()
        }
        return
    }

    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const entry = allSyllables[selectedWordIndex]
    if (!entry || entry.isEndOfLine) return
    const { lineIdx, syllabusIdx } = entry
    const line = tempLyrics[lineIdx]
    if (!line || syllabusIdx >= line.syllabus.length - 1) return

    pushHistoryState()
    const cur = line.syllabus[syllabusIdx]
    const nxt = line.syllabus[syllabusIdx + 1]
    const start = (cur.isDone && cur.time > 0) ? cur.time : (nxt.time || 0)
    const endA = (cur.time || 0) + (cur.duration || 0)
    const endB = (nxt.time || 0) + (nxt.duration || 0)
    cur.text = (cur.text || '').replace(/]/g, '') + (nxt.text || '').replace(/]/g, '')
    cur.isDone = cur.isDone || nxt.isDone
    cur.time = cur.isDone ? start : 0
    cur.duration = cur.isDone ? Math.max(0, Math.max(endA, endB) - start) : 0

    line.syllabus.splice(syllabusIdx + 1, 1)
    line.text = line.syllabus.map(s => (s.text || '').replace(/]/g, '')).join('')
    _recalcLineBounds(line)
    _syncLyricsInputFromModel()
    _resyncAfterStructuralChange(lineIdx, syllabusIdx)
    renderTimeline()
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function shiftSelectedLine(deltaMs) {
    const entries = _getSelectedEntries()
    if (entries.length > 1) {
        pushHistoryState()
        const affectedLines = new Set()
        entries.forEach(e => {
            const wp = _timelineChipMap.get(e.idx)
            const baseT = (e.syl.isDone && e.syl.time > 0) ? e.syl.time : (wp ? wp.startMs : 0)
            const baseD = (e.syl.isDone && e.syl.duration > 0) ? e.syl.duration : (wp ? wp.durMs : 300)
            e.syl.time = Math.max(0, baseT + deltaMs)
            e.syl.duration = baseD
            e.syl.isDone = true
            if (e.syl.element) {
                e.syl.element.classList.add('done-word')
                e.syl.element.style.setProperty('--duration', baseD + 'ms')
            }
            affectedLines.add(e.line)
        })
        affectedLines.forEach(l => _recalcLineBounds(l))
        renderTimeline()
        _updateMultiSelectionPropertiesUI(_getSelectedEntries())
        if (isPreviewActive()) refreshLyricsPlusPreview()
        return
    }
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const entry = allSyllables[selectedWordIndex]
    if (!entry || entry.isEndOfLine) return
    const line = tempLyrics[entry.lineIdx]
    if (!line || line.isTaggedLine) return
    pushHistoryState()
    ;(line.syllabus || []).forEach(s => {
        if (s.isDone && s.time > 0) {
            s.time = Math.max(0, s.time + deltaMs)
        }
    })
    _recalcLineBounds(line)
    openWord(selectedWordIndex)
    renderTimeline()
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function autoDistributeSelectedLine() {
    if (selectedWordIndices.size > 1) {
        distributeSelectedWordsEvenly()
        return
    }
    let targetLine = null
    if (selectedWordIndex !== -1 && selectedWordIndex < allSyllables.length) {
        const entry = allSyllables[selectedWordIndex]
        if (entry && !entry.isEndOfLine) targetLine = tempLyrics[entry.lineIdx]
    }
    if (!targetLine) {
        targetLine = tempLyrics.find(l => !l.isTaggedLine && l.syllabus && l.syllabus.length > 0)
    }
    if (!targetLine || targetLine.isTaggedLine || !targetLine.syllabus || !targetLine.syllabus.length) return
    pushHistoryState()
    const startMs = targetLine.time > 0 ? targetLine.time : Math.round(player.currentTime * 1000)
    const totalDur = targetLine.duration >= 600 ? targetLine.duration : Math.max(1200, targetLine.syllabus.length * 380)
    const weights = targetLine.syllabus.map(s => Math.max(1, (s.text || '').replace(/]/g, '').trim().length))
    const weightSum = weights.reduce((a, b) => a + b, 0) || targetLine.syllabus.length
    let cursor = startMs
    targetLine.syllabus.forEach((s, i) => {
        const dur = Math.max(80, Math.round(totalDur * (weights[i] / weightSum)))
        s.time = cursor
        s.duration = dur
        s.isDone = true
        if (s.element) {
            s.element.classList.add('done-word')
            s.element.style.setProperty('--duration', dur + 'ms')
        }
        cursor += dur
    })
    _recalcLineBounds(targetLine)
    if (selectedWordIndex !== -1) openWord(selectedWordIndex)
    renderTimeline()
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function onSelectedSyllableRomanizedInput(val) {
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const entry = allSyllables[selectedWordIndex]
    if (!entry || entry.isEndOfLine) return
    const line = tempLyrics[entry.lineIdx]
    const syl = line?.syllabus[entry.syllabusIdx]
    if (!syl) return

    const origClean = (syl.text || '').replace(/]/g, '')
    const trail = (origClean.match(/\s+$/) || [''])[0]
    const trimmed = (val || '').trim()
    syl.romanizedText = trimmed ? (trimmed + trail) : undefined

    if (line.syllabus.some(s => s.romanizedText)) {
        line.romanizedText = line.syllabus.map(s => s.romanizedText || (s.text || '').replace(/]/g, '')).join('')
        const lRom = document.getElementById('properties-line-romanized')
        if (lRom) lRom.value = line.romanizedText
    }

    _markDirtyAndAutoSave()
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function _distributeRomanizationOnLine(line, romText) {
    if (!line || !line.syllabus || !line.syllabus.length) return
    const cleanRom = (romText || '').trim()
    if (!cleanRom) {
        line.romanizedText = undefined
        line.syllabus.forEach(s => { delete s.romanizedText })
        return
    }
    const tokens = splitTextWithSeparators(cleanRom).map(t => t.replace(/]/g, ''))
    if (tokens.length === line.syllabus.length) {
        line.syllabus.forEach((s, idx) => {
            const origClean = (s.text || '').replace(/]/g, '')
            const origTrail = (origClean.match(/\s+$/) || [''])[0]
            const tokTrim = tokens[idx].trim()
            s.romanizedText = tokTrim ? (tokTrim + origTrail) : undefined
        })
    } else {
        const spaceParts = cleanRom.split(/\s+/).filter(Boolean)
        if (spaceParts.length === line.syllabus.length) {
            line.syllabus.forEach((s, idx) => {
                const origClean = (s.text || '').replace(/]/g, '')
                const origTrail = (origClean.match(/\s+$/) || [''])[0]
                s.romanizedText = spaceParts[idx] + origTrail
            })
        } else {
            let wordIdx = 0
            let curWordSyls = []
            const flushWord = () => {
                if (!curWordSyls.length) return
                const romWord = spaceParts[wordIdx] || ''
                wordIdx++
                if (curWordSyls.length === 1) {
                    const s = curWordSyls[0]
                    const origTrail = ((s.text || '').replace(/]/g, '').match(/\s+$/) || [''])[0]
                    s.romanizedText = romWord ? (romWord + origTrail) : undefined
                } else {
                    const chunkLen = Math.max(1, Math.ceil(romWord.length / curWordSyls.length))
                    curWordSyls.forEach((s, ci) => {
                        const isLast = ci === curWordSyls.length - 1
                        const slice = isLast ? romWord.slice(ci * chunkLen) : romWord.slice(ci * chunkLen, (ci + 1) * chunkLen)
                        const origTrail = ((s.text || '').replace(/]/g, '').match(/\s+$/) || [''])[0]
                        s.romanizedText = (slice || romWord) + (isLast ? origTrail : '')
                    })
                }
                curWordSyls = []
            }
            line.syllabus.forEach(s => {
                curWordSyls.push(s)
                if (/\s$/.test((s.text || '').replace(/]/g, ''))) flushWord()
            })
            flushWord()
        }
    }
    line.romanizedText = line.syllabus.map(s => s.romanizedText || (s.text || '').replace(/]/g, '')).join('')
}

function onSelectedLineRomanizedChange(val) {
    if (selectedWordIndex === -1 || selectedWordIndex >= allSyllables.length) return
    const entry = allSyllables[selectedWordIndex]
    if (!entry || entry.isEndOfLine) return
    const line = tempLyrics[entry.lineIdx]
    if (!line) return
    pushHistoryState()
    _distributeRomanizationOnLine(line, val)
    if (selectedWordIndices.size > 1) {
        _updateMultiSelectionPropertiesUI(_getSelectedEntries())
    } else {
        openWord(selectedWordIndex)
    }
    _markDirtyAndAutoSave()
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function distributeLineRomanizationToSyllables() {
    const inp = document.getElementById('properties-line-romanized')
    if (inp) onSelectedLineRomanizedChange(inp.value)
}

function onSelectedLineTranslatedInput(val) {
    const entries = _getSelectedEntries()
    if (entries.length === 0) return
    const lineIndices = Array.from(new Set(entries.map(e => e.lineIdx)))
    lineIndices.forEach(li => {
        if (tempLyrics[li]) {
            tempLyrics[li].translatedText = (val || '').trim() || undefined
        }
    })
    _markDirtyAndAutoSave()
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function importAnyLyricsFile(onSuccess) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.kmake,.json,.ttml,.xml,.lrc,.elrc,.txt'
    input.onchange = function () {
        const file = this.files[0]
        if (!file) return
        const lowerName = file.name.toLowerCase()
        if (lowerName.endsWith('.kmake')) {
            const reader = new FileReader()
            reader.readAsArrayBuffer(file)
            reader.onload = readerEvent => {
                JSZip.loadAsync(readerEvent.target.result).then(function (zip) {
                    currentProjectId = 'proj_' + Date.now()
                    const audioFile = zip.file("audiofile.kmakefile")
                    if (audioFile) {
                        audioFile.async("blob").then(function (content) {
                            const f = new File([content], 'audiofile.mp3')
                            const fl = new DataTransfer()
                            fl.items.add(f)
                            elem_musicInput.files = fl.files
                            elem_musicInput.dispatchEvent(new Event('change'))
                        })
                    }
                    const lyricsFile = zip.file("lyrics.kmakefile")
                    if (lyricsFile) {
                        lyricsFile.async("string").then(function (content) {
                            const jsonData = JSON.parse(content)
                            if (detectKpoeFormat(jsonData) === 'v2') parseNewKpoeFormat(jsonData)
                            else parseLegacyToV2(jsonData)
                            if (onSuccess) onSuccess()
                        })
                    }
                })
            }
            return
        }
        const reader = new FileReader()
        reader.readAsText(file, 'UTF-8')
        reader.onload = function (evt) {
            const text = (evt.target.result || '').trim()
            if (!text) return
            pushHistoryState()
            currentProjectId = 'proj_' + Date.now()
            importedJSON = true
            if (lowerName.endsWith('.ttml') || lowerName.endsWith('.xml') || text.startsWith('<')) {
                if (window.lyricspluslib?.parseAppleTTML) {
                    const res = window.lyricspluslib.parseAppleTTML(text)
                    if (res && res.lyrics) {
                        parseNewKpoeFormat(res)
                        if (onSuccess) onSuccess()
                        return
                    }
                }
                alert('Failed to parse TTML file.')
                return
            }
            if (lowerName.endsWith('.lrc') || lowerName.endsWith('.elrc') || /^\[\d{1,3}:\d{2}/m.test(text)) {
                parseLRCText(text)
                if (onSuccess) onSuccess()
                return
            }
            try {
                const jsonData = JSON.parse(text)
                if (detectKpoeFormat(jsonData) === 'v2') {
                    parseNewKpoeFormat(jsonData)
                } else if (window.lyricspluslib?.v1Tov2 && Array.isArray(jsonData.lyrics)) {
                    parseNewKpoeFormat(window.lyricspluslib.v1Tov2(jsonData))
                } else {
                    parseLegacyToV2(jsonData)
                }
                if (onSuccess) onSuccess()
            } catch (e) {
                elem_lyricsInput.value = text
                parseLyrics()
                if (onSuccess) onSuccess()
            }
        }
    }
    input.click()
}

function importTTMLFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.ttml,.xml'
    input.onchange = function () {
        const file = this.files[0]
        if (!file) return
        const reader = new FileReader()
        reader.readAsText(file, 'UTF-8')
        reader.onload = function (evt) {
            if (!window.lyricspluslib?.parseAppleTTML) return
            const parsed = window.lyricspluslib.parseAppleTTML(evt.target.result)
            if (parsed && parsed.lyrics) {
                pushHistoryState()
                importedJSON = true
                parseNewKpoeFormat(parsed)
                toggleHomePage(false)
            } else {
                alert('Invalid TTML file.')
            }
        }
    }
    input.click()
}

function importLRCFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.lrc,.elrc,.txt'
    input.onchange = function () {
        const file = this.files[0]
        if (!file) return
        const reader = new FileReader()
        reader.readAsText(file, 'UTF-8')
        reader.onload = function (evt) {
            pushHistoryState()
            importedJSON = true
            parseLRCText(evt.target.result)
            toggleHomePage(false)
        }
    }
    input.click()
}

function parseLRCText(rawText) {
    if (!rawText || !rawText.trim()) return
    if (window.lyricspluslib?.parseSyncedLyrics) {
        const parsed = window.lyricspluslib.parseSyncedLyrics(rawText)
        if (parsed && parsed.lyrics && parsed.lyrics.length > 0) {
            const normalized = window.lyricspluslib.v1Tov2
                ? (parsed.lyrics[0].element?.songPartIndex != null ? parsed : { ...parsed, lyrics: parsed.lyrics.map((l, i) => ({ ...l, element: { key: 'L' + (i + 1), singer: l.element?.singer || 'v1', songPartIndex: -1 } })) })
                : parsed
            parseNewKpoeFormat(normalized)
            return
        }
    }
}

function _msToTTMLTime(ms) {
    const totalMs = Math.max(0, Math.round(ms || 0))
    const hours = Math.floor(totalMs / 3600000)
    const minutes = Math.floor((totalMs % 3600000) / 60000)
    const seconds = Math.floor((totalMs % 60000) / 1000)
    const millis = totalMs % 1000
    const mStr = String(minutes).padStart(2, '0')
    const sStr = String(seconds).padStart(2, '0')
    const msStr = String(millis).padStart(3, '0')
    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${mStr}:${sStr}.${msStr}`
    }
    return `${mStr}:${sStr}.${msStr}`
}

function _escapeXml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function prepareTTML(cleanTiming = true) {
    if (!tempLyrics || tempLyrics.length === 0) {
        return new Blob([''], { type: 'application/ttml+xml' })
    }
    _recomputeSongPartTimeline()

    const durMs = (player.duration || audioDurationSec || 0) * 1000
    const totalDurStr = durMs > 0 ? _msToTTMLTime(durMs) : (metadata.totalDuration || '00:00.000')
    const lang = _escapeXml(metadata.language || 'en')

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
    xml += `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:amll="http://www.example.com/ns/amll" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" xml:lang="${lang}" itunes:timing="Word">\n`
    xml += `  <head>\n    <metadata>\n`

    const agents = metadata.agents || { v1: { type: 'person', name: '', alias: 'v1' } }
    for (const alias in agents) {
        const ag = agents[alias]
        const agId = _escapeXml(ag.alias || alias)
        const agType = _escapeXml(ag.type || 'person')
        xml += `      <ttm:agent type="${agType}" xml:id="${agId}">\n`
        if (ag.name) {
            xml += `        <ttm:name type="full">${_escapeXml(ag.name)}</ttm:name>\n`
        }
        xml += `      </ttm:agent>\n`
    }

    xml += `      <iTunesMetadata xmlns="http://music.apple.com/lyric-ttml-internal">\n`
    if (metadata.title) {
        xml += `        <title>${_escapeXml(metadata.title)}</title>\n`
    }
    if (metadata.songWriters && metadata.songWriters.length > 0) {
        xml += `        <songwriters>\n`
        metadata.songWriters.forEach(sw => {
            if (sw && sw.trim()) {
                xml += `          <songwriter>${_escapeXml(sw.trim())}</songwriter>\n`
            }
        })
        xml += `        </songwriters>\n`
    }
    const validForMeta = tempLyrics.filter(l => l && !l.isTaggedLine && (l.text || '').trim() !== '')
    const linesWithTrans = validForMeta.filter(l => l.translatedText && l.translatedText.trim())
    if (linesWithTrans.length > 0) {
        xml += `        <translations>\n          <translation type="subtitle" xml:lang="en">\n`
        linesWithTrans.forEach((l, idx) => {
            const k = _escapeXml(l.element?.key || ('L' + (idx + 1)))
            xml += `            <text for="${k}">${_escapeXml(l.translatedText.trim())}</text>\n`
        })
        xml += `          </translation>\n        </translations>\n`
    }
    const linesWithRom = validForMeta.filter(l => (l.romanizedText && l.romanizedText.trim()) || (l.syllabus || []).some(s => s.romanizedText && s.romanizedText.trim()))
    if (linesWithRom.length > 0) {
        xml += `        <transliterations>\n          <transliteration xml:lang="${lang}-Latn">\n`
        linesWithRom.forEach((l, idx) => {
            const k = _escapeXml(l.element?.key || ('L' + (idx + 1)))
            const hasSylRom = (l.syllabus || []).some(s => s.romanizedText && s.romanizedText.trim())
            if (hasSylRom) {
                xml += `            <text for="${k}">`
                ;(l.syllabus || []).forEach(s => {
                    const origTxt = (s.text || '').replace(/]/g, '')
                    const romTxt = s.romanizedText || origTxt
                    const trail = (romTxt.match(/\s+$/) || (origTxt.match(/\s+$/) || ['']))[0]
                    const core = romTxt.trim()
                    const sS = s.time || 0
                    const sE = sS + (s.duration || 0)
                    xml += `<span begin="${_msToTTMLTime(sS)}" end="${_msToTTMLTime(sE)}">${_escapeXml(core)}</span>${trail}`
                })
                xml += `</text>\n`
            } else {
                xml += `            <text for="${k}">${_escapeXml(l.romanizedText.trim())}</text>\n`
            }
        })
        xml += `          </transliteration>\n        </transliterations>\n`
    }
    xml += `      </iTunesMetadata>\n`
    xml += `    </metadata>\n  </head>\n`
    xml += `  <body dur="${_escapeXml(totalDurStr)}">\n`

    const validLines = tempLyrics.filter(l => {
        if (!l || l.isTaggedLine) return false
        if (cleanTiming && (l.text || '').replace(/\]/g, '').trim() === '') return false
        return true
    })

    const groups = []
    let curGroup = null
    validLines.forEach(line => {
        const pIdx = line.element?.songPartIndex ?? -1
        if (!curGroup || curGroup.partIdx !== pIdx) {
            curGroup = { partIdx: pIdx, lines: [] }
            groups.push(curGroup)
        }
        curGroup.lines.push(line)
    })

    let lineKeyCounter = 1
    groups.forEach(grp => {
        const partObj = (grp.partIdx >= 0 && metadata.songParts[grp.partIdx]) ? metadata.songParts[grp.partIdx] : null
        const partName = partObj?.name || ''
        let divStart = partObj?.time || 0
        let divEnd = (partObj?.time || 0) + (partObj?.duration || 0)
        if (!divStart && grp.lines.length > 0) {
            divStart = grp.lines[0].time || 0
            const lastL = grp.lines[grp.lines.length - 1]
            divEnd = (lastL.time || 0) + (lastL.duration || 0)
        }
        const partAttr = partName ? ` itunes:song-part="${_escapeXml(partName)}"` : ''
        xml += `    <div begin="${_msToTTMLTime(divStart)}" end="${_msToTTMLTime(divEnd)}"${partAttr}>\n`

        grp.lines.forEach(line => {
            const rawSyls = (line.syllabus || []).filter(s => !cleanTiming || (s.text || '').replace(/]/g, '').trim() !== '')
            const lStart = line.time || (rawSyls[0]?.time || 0)
            const lEnd = rawSyls.length > 0
                ? Math.max(...rawSyls.map(s => (s.time || 0) + (s.duration || 0)))
                : (lStart + (line.duration || 0))
            const key = _escapeXml(line.element?.key || ('L' + (lineKeyCounter++)))
            const singer = _escapeXml(line.element?.singer || 'v1')

            xml += `      <p begin="${_msToTTMLTime(lStart)}" end="${_msToTTMLTime(lEnd)}" itunes:key="${key}" ttm:agent="${singer}">`

            let i = 0
            while (i < rawSyls.length) {
                const s = rawSyls[i]
                if (s.isBackground) {
                    const bgRun = []
                    while (i < rawSyls.length && rawSyls[i].isBackground) {
                        bgRun.push(rawSyls[i])
                        i++
                    }
                    const bgStart = bgRun[0].time || 0
                    const bgEnd = Math.max(...bgRun.map(b => (b.time || 0) + (b.duration || 0)))
                    xml += `<span ttm:role="x-bg" begin="${_msToTTMLTime(bgStart)}" end="${_msToTTMLTime(bgEnd)}">`
                    bgRun.forEach(b => {
                        const rawTxt = (b.text || '').replace(/]/g, '')
                        const trail = (rawTxt.match(/\s+$/) || [''])[0]
                        const core = rawTxt.slice(0, rawTxt.length - trail.length)
                        const bS = b.time || 0
                        const bE = bS + (b.duration || 0)
                        xml += `<span begin="${_msToTTMLTime(bS)}" end="${_msToTTMLTime(bE)}">${_escapeXml(core)}</span>${trail}`
                    })
                    xml += `</span>`
                } else {
                    const rawTxt = (s.text || '').replace(/]/g, '')
                    const trail = (rawTxt.match(/\s+$/) || [''])[0]
                    const core = rawTxt.slice(0, rawTxt.length - trail.length)
                    const sS = s.time || 0
                    const sE = sS + (s.duration || 0)
                    xml += `<span begin="${_msToTTMLTime(sS)}" end="${_msToTTMLTime(sE)}">${_escapeXml(core)}</span>${trail}`
                    i++
                }
            }

            xml += `</p>\n`
        })

        xml += `    </div>\n`
    })

    xml += `  </body>\n</tt>`
    return new Blob([xml], { type: 'application/ttml+xml' })
}

function exportTTML() {
    if (!metadataEverOpened) { openMetadataEditor(() => exportTTML()); return }
    _runExport(() => downloadBlob(prepareTTML(), 'ttml'))
}

let _smoothAnchorMediaTime = 0
let _smoothAnchorPerfTime = 0
let _smoothWasPaused = true

function _getSmoothPlayerTimeSec() {
    if (!player) return 0
    const rawT = player.currentTime || 0
    const paused = Boolean(player.paused)
    const now = performance.now()
    if (paused) {
        _smoothAnchorMediaTime = rawT
        _smoothAnchorPerfTime = now
        _smoothWasPaused = true
        return rawT
    }
    if (_smoothWasPaused || Math.abs(rawT - _smoothAnchorMediaTime) > 0.0005) {
        _smoothAnchorMediaTime = rawT
        _smoothAnchorPerfTime = now
        _smoothWasPaused = false
        return rawT
    }
    const rate = player.speed || 1
    const elapsedSec = Math.min(0.35, Math.max(0, (now - _smoothAnchorPerfTime) / 1000)) * rate
    return _smoothAnchorMediaTime + elapsedSec
}

function initLyricsPlusRenderer() {
    if (typeof LyricsPlusRenderer === 'undefined') return null
    if (!lyricsRendererInstance) {
        lyricsRendererInstance = new LyricsPlusRenderer({
            patchParent: '#lyrics-plus-container-parent',
            buttonParent: '#lyrics-plus-container-parent',
            selectors: ['#lyrics-plus-container-parent'],
            player: '#music-player',
            getCurrentTime: () => _getSmoothPlayerTimeSec(),
            seekTo: (t) => {
                if (player) {
                    player.currentTime = Math.max(0, t)
                    _smoothAnchorMediaTime = Math.max(0, t)
                    _smoothAnchorPerfTime = performance.now()
                }
            },
            disableNativeTick: false
        })
        lyricsRendererInstance._getPlayerElement = () => ({
            paused: player ? Boolean(player.paused) : true
        })
    }
    return lyricsRendererInstance
}

function buildLyricsPlusData() {
    _recomputeSongPartTimeline()
    const validLines = tempLyrics.filter(l => !l.isTaggedLine && (l.text || '').replace(/]/g, '').trim() !== '')
    let runningMs = 0
    const data = validLines.map((line, idx) => {
        const rawSyls = (line.syllabus || []).filter(s => (s.text || '').replace(/]/g, '').trim() !== '')
        let lineCursorMs = (line.time && line.time > 0) ? line.time : runningMs
        const syllabus = rawSyls.map((s) => {
            const hasRealTime = s.isDone && s.time > 0
            const startMs = hasRealTime ? Math.round(s.time) : lineCursorMs
            const durMs = (hasRealTime && s.duration > 0) ? Math.round(s.duration) : 380
            lineCursorMs = Math.max(lineCursorMs, startMs + durMs)
            return {
                time: startMs,
                duration: durMs,
                text: (s.text || '').replace(/]/g, ''),
                isBackground: !!s.isBackground,
                romanizedText: s.romanizedText
            }
        })
        const firstStartMs = syllabus.length > 0 ? syllabus[0].time : lineCursorMs
        const maxEndMs = syllabus.length > 0 ? Math.max(...syllabus.map(s => s.time + s.duration)) : (firstStartMs + 1500)
        runningMs = Math.max(runningMs, maxEndMs + 250)
        return {
            startTime: firstStartMs / 1000,
            endTime: Math.max(firstStartMs / 1000 + 0.4, maxEndMs / 1000),
            text: syllabus.map(s => s.text).join(''),
            translatedText: line.translatedText,
            romanizedText: line.romanizedText,
            element: {
                key: line.element?.key || ('L' + idx),
                singer: line.element?.singer || 'v1',
                songPartIndex: line.element?.songPartIndex ?? -1
            },
            syllabus
        }
    })

    return {
        type: window.currentSettings.wordByWord ? 'Word' : 'Line',
        provider: 'kmake',
        metadata: {
            source: metadata.source || '',
            songWriters: metadata.songWriters || [],
            title: metadata.title || '',
            artist: metadata.artist || '',
            album: metadata.album || '',
            language: metadata.language || '',
            agents: metadata.agents || { v1: { type: 'person', name: '', alias: 'v1' } },
            songParts: metadata.songParts || [],
            totalDuration: metadata.totalDuration || ''
        },
        data
    }
}

let _cachedBlurredArtSource = null
let _cachedBlurredArtDataUrl = null

function _updatePreviewSongCard() {
    const ambientBg = document.getElementById('preview-ambient-bg')
    if (!ambientBg) return

    if (editorSettings.previewBlurredArt === false) {
        ambientBg.classList.add('solid-bg')
        ambientBg.style.backgroundImage = 'none'
        return
    }

    ambientBg.classList.remove('solid-bg')
    const srcArt = document.getElementById('music-album-art')
    const hasArt = Boolean(srcArt && srcArt.getAttribute('src') && srcArt.getAttribute('src').trim() !== '')
    const rawUrl = hasArt ? srcArt.src : DEFAULT_ARTWORK_SVG_URI

    if (_cachedBlurredArtSource === rawUrl && _cachedBlurredArtDataUrl) {
        ambientBg.style.backgroundImage = `url("${_cachedBlurredArtDataUrl}")`
        return
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = function () {
        try {
            const c = document.createElement('canvas')
            c.width = 96
            c.height = 96
            const ctx = c.getContext('2d')
            ctx.filter = 'blur(10px) saturate(1.35) brightness(0.52)'
            ctx.drawImage(img, -12, -12, 120, 120)
            ctx.filter = 'none'
            ctx.fillStyle = 'rgba(16, 14, 20, 0.36)'
            ctx.fillRect(0, 0, 96, 96)
            _cachedBlurredArtSource = rawUrl
            _cachedBlurredArtDataUrl = c.toDataURL('image/png')
            ambientBg.style.backgroundImage = `url("${_cachedBlurredArtDataUrl}")`
        } catch (err) {
            ambientBg.style.backgroundImage = `linear-gradient(rgba(16, 14, 20, 0.65), rgba(16, 14, 20, 0.78)), url("${ DEFAULT_ARTWORK_SVG_URI }")`
        }
    }
    img.onerror = function () {
        ambientBg.style.backgroundImage = `url("${DEFAULT_ARTWORK_SVG_URI}")`
    }
    img.src = rawUrl
}

function refreshLyricsPlusPreview() {
    _updatePreviewSongCard()
    const renderer = initLyricsPlusRenderer()
    if (!renderer) return
    const lpData = buildLyricsPlusData()
    const songInfo = {
        title: metadata.title || 'Kmake Preview',
        artist: metadata.artist || '',
        album: metadata.album || ''
    }
    renderer.displayLyrics(
        lpData,
        songInfo,
        currentDisplayMode,
        window.currentSettings,
        () => refreshLyricsPlusPreview(),
        (newMode) => { currentDisplayMode = newMode; refreshLyricsPlusPreview() },
        'lyrics',
        0
    )
    requestAnimationFrame(() => {
        if (!renderer.cachedLyricsLines || !renderer.cachedLyricsLines.length) return
        const curMs = (player ? (player.currentTime || 0) : 0) * 1000
        let activeIdx = renderer._getLineIndexAtTime ? renderer._getLineIndexAtTime(curMs) : 0
        if (activeIdx < 0) activeIdx = 0
        const minVis = Math.max(0, activeIdx - 2)
        const maxVis = Math.min(renderer.cachedLyricsLines.length - 1, activeIdx + 6)
        for (let i = minVis; i <= maxVis; i++) {
            const l = renderer.cachedLyricsLines[i]
            if (l && l.id) renderer.visibleLineIds.add(l.id)
        }
        renderer.lastTime = -1
        renderer.updateCurrentTick(player ? (player.currentTime || 0) : 0)
    })
}

function togglePreviewWordByWord() {
    window.currentSettings.wordByWord = !window.currentSettings.wordByWord
    document.getElementById('prev-btn-wbw')?.classList.toggle('enabled', window.currentSettings.wordByWord)
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function togglePreviewBlur() {
    window.currentSettings.blurInactive = !window.currentSettings.blurInactive
    document.getElementById('prev-btn-blur')?.classList.toggle('enabled', window.currentSettings.blurInactive)
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function cyclePreviewDisplayMode() {
    const order = ['none', 'romanize', 'translate', 'both']
    const labels = { none: 'Original', romanize: 'Pronunciation', translate: 'Translation', both: 'Both' }
    const next = order[(order.indexOf(currentDisplayMode) + 1) % order.length]
    currentDisplayMode = next
    const lbl = document.getElementById('prev-display-label')
    if (lbl) lbl.textContent = labels[next]
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function toggleTimelineFollow() {
    tlFollow = !tlFollow
    document.getElementById('tl-btn-follow')?.classList.toggle('enabled', tlFollow)
}

function toggleTimelineSnap() {
    tlSnap = !tlSnap
    document.getElementById('tl-btn-snap')?.classList.toggle('enabled', tlSnap)
}

function toggleTimelineRipple() {
    tlRipple = !tlRipple
    document.getElementById('tl-btn-ripple')?.classList.toggle('enabled', tlRipple)
}

let _lastTimelineMouseX = null

function _getTimelineCursorTimeMs(clientX) {
    const vp = document.getElementById('tl-viewport')
    if (!vp) return 0
    const rect = vp.getBoundingClientRect()
    const worldPx = (clientX - rect.left - 56) + (vp.scrollLeft || 0)
    return Math.max(0, Math.round((worldPx / tlZoom) * 1000))
}

function timelineZoom(delta, anchorClientX) {
    const oldZoom = tlZoom
    const newZoom = Math.max(44, Math.min(360, tlZoom + delta))
    if (newZoom === oldZoom) return

    const vp = document.getElementById('tl-viewport')
    let anchorTimeSec = null
    let offsetInTrackPx = 0

    if (vp) {
        const rect = vp.getBoundingClientRect()
        const visW = Math.max(100, rect.width - 56)
        const effClientX = anchorClientX !== undefined ? anchorClientX : _lastTimelineMouseX
        if (effClientX !== null && effClientX >= rect.left + 56 && effClientX <= rect.right) {
            offsetInTrackPx = effClientX - rect.left - 56
            anchorTimeSec = ((vp.scrollLeft || 0) + offsetInTrackPx) / oldZoom
        } else {
            const curSec = player ? (player.currentTime || 0) : 0
            const playheadPx = curSec * oldZoom
            if (playheadPx >= (vp.scrollLeft || 0) && playheadPx <= (vp.scrollLeft || 0) + visW) {
                offsetInTrackPx = playheadPx - (vp.scrollLeft || 0)
                anchorTimeSec = curSec
            } else {
                offsetInTrackPx = visW * 0.5
                anchorTimeSec = ((vp.scrollLeft || 0) + offsetInTrackPx) / oldZoom
            }
        }
    }

    tlZoom = newZoom
    const lbl = document.getElementById('tl-zoom-label')
    if (lbl) lbl.textContent = Math.round((tlZoom / 110) * 100) + '%'
    renderTimeline()

    if (vp && anchorTimeSec !== null) {
        vp.scrollLeft = Math.max(0, Math.round(anchorTimeSec * newZoom - offsetInTrackPx))
        _drawTimelineWaveform()
    }
}

function _generateSyntheticWaveform(seedStr, durationSec) {
    const dur = Math.max(30, durationSec || 180)
    audioDurationSec = dur
    const sampleRatePerSec = 45
    const totalSamples = Math.ceil(dur * sampleRatePerSec)
    let hash = 2166136261
    for (let i = 0; i < (seedStr || 'kmake').length; i++) {
        hash ^= seedStr.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    const peaks = new Float32Array(totalSamples)
    for (let i = 0; i < totalSamples; i++) {
        hash ^= (i & 255)
        hash = Math.imul(hash, 16777619)
        const r = ((hash >>> 0) % 1000) / 1000
        const t = i / sampleRatePerSec
        const env = 0.25 + 0.45 * Math.abs(Math.sin(t * 1.7) * Math.cos(t * 0.43)) + 0.25 * r
        peaks[i] = Math.min(0.95, Math.max(0.08, env))
    }
    audioPeaks = peaks
    renderTimeline()
}

function _decodeAudioWaveform(file) {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (!Ctx) return
        const ctx = new Ctx()
        const reader = new FileReader()
        reader.onload = function (e) {
            ctx.decodeAudioData(e.target.result, function (buffer) {
                audioDurationSec = buffer.duration || 0
                const chan = buffer.getChannelData(0)
                const bucketSize = Math.max(1, Math.floor(buffer.sampleRate / 45))
                const peaks = new Float32Array(Math.ceil(chan.length / bucketSize))
                let pIdx = 0
                for (let i = 0; i < chan.length; i += bucketSize) {
                    let max = 0
                    const limit = Math.min(chan.length, i + bucketSize)
                    for (let j = i; j < limit; j += 4) {
                        const v = Math.abs(chan[j])
                        if (v > max) max = v
                    }
                    peaks[pIdx++] = max
                }
                audioPeaks = peaks
                renderTimeline()
                ctx.close().catch(() => {})
            }, function () {
                ctx.close().catch(() => {})
            })
        }
        reader.readAsArrayBuffer(file)
    } catch (e) {}
}

function _drawTimelineWaveform() {
    const canvas = document.getElementById('tl-waveform')
    const vp = document.getElementById('tl-viewport')
    const track = document.getElementById('tl-wave-track')
    if (!canvas || !vp || !track) return

    const scrollLeft = vp.scrollLeft || 0
    const viewW = Math.max(200, (vp.clientWidth || 800) - 56)
    const viewH = track.clientHeight || 68
    const dpr = window.devicePixelRatio || 1

    canvas.style.left = scrollLeft + 'px'
    canvas.style.width = viewW + 'px'
    canvas.style.height = viewH + 'px'

    const targetW = Math.round(viewW * dpr)
    const targetH = Math.round(viewH * dpr)
    if (canvas.width !== targetW) canvas.width = targetW
    if (canvas.height !== targetH) canvas.height = targetH

    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, viewW, viewH)

    const midY = viewH / 2
    const barW = 2
    const barGap = 2
    const stepPx = barW + barGap
    const curSec = player ? (player.currentTime || 0) : 0
    const firstWorldX = Math.floor(scrollLeft / stepPx) * stepPx
    const endWorldX = scrollLeft + viewW

    const hasPeaks = audioPeaks && audioPeaks.length > 0 && audioDurationSec > 0
    for (let worldX = firstWorldX; worldX < endWorldX; worldX += stepPx) {
        const localX = worldX - scrollLeft
        if (localX + barW < 0) continue
        const secAtBar = worldX / tlZoom
        let amp = 0.08
        if (hasPeaks) {
            if (secAtBar <= audioDurationSec) {
                const pIdx = Math.min(audioPeaks.length - 1, Math.floor((secAtBar / audioDurationSec) * audioPeaks.length))
                amp = audioPeaks[pIdx] || 0.05
            } else {
                amp = 0.03
            }
        } else {
            amp = 0.2 + 0.34 * Math.abs(Math.sin(secAtBar * 5.2) * Math.cos(secAtBar * 1.9)) + 0.18 * Math.abs(Math.sin(secAtBar * 13.7))
        }
        const barH = Math.max(3, amp * (viewH * 0.82))
        ctx.fillStyle = secAtBar <= curSec
            ? 'rgba(211, 188, 253, 0.85)'
            : 'rgba(203, 196, 207, 0.34)'
        ctx.fillRect(localX, midY - barH / 2, barW, barH)
    }
}

function _collectSnapTargets(excludedSet) {
    const targets = []
    let cursor = 0
    tempLyrics.forEach((line) => {
        if (!line || line.isTaggedLine) return
        ;(line.syllabus || []).forEach((s) => {
            const idx = cursor++
            if (excludedSet && excludedSet.has(idx)) return
            if (s.isDone && s.time > 0) {
                targets.push(s.time)
                if (s.duration > 0) targets.push(s.time + s.duration)
            }
        })
    })
    return targets
}

function _snapTimeMs(valMs, targets) {
    if (!tlSnap) return Math.max(0, Math.round(valMs))
    const thresholdMs = 35
    for (let i = 0; i < targets.length; i++) {
        if (Math.abs(valMs - targets[i]) <= thresholdMs) {
            return targets[i]
        }
    }
    const step = editorSettings.snapStepMs || 25
    return Math.max(0, Math.round(valMs / step) * step)
}

function renderTimeline() {
    const stage = document.getElementById('tl-stage')
    const ruler = document.getElementById('tl-ruler')
    const rowsBody = document.getElementById('tl-rows-body')
    const viewport = document.getElementById('tl-viewport')
    if (!stage || !ruler || !rowsBody) return

    _timelineChipMap.clear()
    let runningMs = 400
    const rowModels = []
    let globalCursorIdx = 0
    let displayRowNum = 1

    tempLyrics.forEach((line, li) => {
        if (!line || line.isTaggedLine) return
        const syls = line.syllabus || []
        if (!syls.length) return

        let lineCursorMs = (line.time && line.time > 0) ? line.time : runningMs
        const chips = []
        let hasBg = false
        let hasMain = false

        syls.forEach((syl, si) => {
            const cursorIdx = globalCursorIdx++
            if (syl.isBackground) hasBg = true
            else hasMain = true

            let startMs, durMs
            if (syl.isDone && syl.time > 0) {
                startMs = syl.time
                durMs = Math.max(120, syl.duration || 360)
                lineCursorMs = Math.max(lineCursorMs, startMs + durMs + 30)
            } else {
                startMs = lineCursorMs
                const charLen = Math.max(2, (syl.text || '').replace(/]/g, '').trim().length)
                durMs = Math.max(260, Math.min(720, charLen * 75))
                lineCursorMs = startMs + durMs + 30
            }
            const wp = { li, si, cursorIdx, syl, startMs, durMs, chipEl: null }
            _timelineChipMap.set(cursorIdx, wp)
            chips.push(wp)
        })

        runningMs = Math.max(runningMs, lineCursorMs + 220)
        rowModels.push({
            li,
            rowNum: displayRowNum++,
            line,
            chips,
            useSubrow: hasBg && hasMain
        })
    })

    const totalSec = Math.max(
        35,
        player?.duration || 0,
        audioDurationSec || 0,
        Math.ceil(runningMs / 1000) + 10
    )
    const minViewportW = viewport ? Math.max(0, viewport.clientWidth - 56) : 700
    const trackWidthPx = Math.max(minViewportW, Math.round(totalSec * tlZoom))
    stage.style.width = (trackWidthPx + 56) + 'px'

    ruler.innerHTML = ''
    const tickStepSec = tlZoom >= 160 ? 1 : (tlZoom >= 80 ? 2 : 5)
    const majorEvery = tickStepSec * 2
    const fragRuler = document.createDocumentFragment()
    for (let s = 0; s <= totalSec; s += tickStepSec) {
        const tick = document.createElement('div')
        tick.className = 'tl-tick' + (s % majorEvery === 0 ? ' major' : '')
        tick.style.left = Math.round(s * tlZoom) + 'px'
        const min = Math.floor(s / 60)
        const sec = s % 60
        tick.textContent = `${min}:${String(sec).padStart(2, '0')}`
        fragRuler.appendChild(tick)
    }
    ruler.appendChild(fragRuler)

    rowsBody.innerHTML = ''
    const fragRows = document.createDocumentFragment()
    const selectedLineSet = new Set(_getSelectedEntries().map(e => e.lineIdx))

    rowModels.forEach(rm => {
        const rowEl = document.createElement('div')
        rowEl.className = 'tl-line-row'
        rowEl.dataset.lineIdx = rm.li
        if (rm.useSubrow) rowEl.classList.add('has-bg-subrow')
        if (selectedLineSet.has(rm.li)) rowEl.classList.add('active-line-row')

        const gutter = document.createElement('div')
        gutter.className = 'tl-row-gutter'
        gutter.title = `Line ${rm.rowNum} (${rm.line.element?.singer || 'v1'}): Click to select all words in line (Shift/Ctrl+Click to multi-select lines), drag horizontally to shift`
        const numSpan = document.createElement('span')
        numSpan.textContent = rm.rowNum
        const singerSpan = document.createElement('span')
        singerSpan.className = 'tl-row-singer-tag'
        singerSpan.textContent = rm.line.element?.singer || 'v1'
        gutter.appendChild(numSpan)
        gutter.appendChild(singerSpan)

        const trackEl = document.createElement('div')
        trackEl.className = 'tl-row-track'

        _bindTimelineLineDrag(gutter, trackEl, rm)

        rm.chips.forEach(wp => {
            const chip = document.createElement('div')
            chip.className = 'tl-word-chip'
            chip.dataset.cursorIdx = wp.cursorIdx
            wp.chipEl = chip
            if (!wp.syl.isDone) chip.classList.add('is-unsynced')
            if (wp.syl.isBackground) chip.classList.add('is-bg')
            if (selectedWordIndices.has(wp.cursorIdx) || wp.cursorIdx === selectedWordIndex) {
                chip.classList.add('is-selected')
            }

            const leftPx = Math.round((wp.startMs / 1000) * tlZoom)
            const widthPx = Math.max(26, Math.round((wp.durMs / 1000) * tlZoom))
            chip.style.left = leftPx + 'px'
            chip.style.width = widthPx + 'px'
            const cleanLabel = (wp.syl.text || '').replace(/]/g, '').trim() || '♪'
            chip.textContent = cleanLabel
            chip.title = `${cleanLabel} (${msToDisplayTime(wp.startMs)} · ${wp.durMs}ms)`

            const edgeL = document.createElement('div')
            edgeL.className = 'tl-edge tl-edge-l'
            const edgeR = document.createElement('div')
            edgeR.className = 'tl-edge tl-edge-r'
            chip.appendChild(edgeL)
            chip.appendChild(edgeR)

            _bindTimelineWordDrag(chip, edgeL, edgeR, wp)
            trackEl.appendChild(chip)
        })

        rowEl.appendChild(gutter)
        rowEl.appendChild(trackEl)
        fragRows.appendChild(rowEl)
    })
    rowsBody.appendChild(fragRows)

    _drawTimelineWaveform()
    updateTimelinePlayhead()
}

function renderTimelineSelection() {
    const selectedLineSet = new Set(_getSelectedEntries().map(e => e.lineIdx))
    document.querySelectorAll('.tl-line-row').forEach(row => {
        const li = parseInt(row.dataset.lineIdx, 10)
        row.classList.toggle('active-line-row', selectedLineSet.has(li))
    })
    document.querySelectorAll('.tl-word-chip').forEach(el => {
        const idx = parseInt(el.dataset.cursorIdx, 10)
        const isSel = selectedWordIndices.has(idx) || (selectedWordIndices.size === 0 && idx === selectedWordIndex)
        el.classList.toggle('is-selected', isSel)
    })
}

function _bindTimelineWordDrag(chip, edgeL, edgeR, wp) {
    chip.addEventListener('dblclick', function (e) {
        e.stopPropagation()
        if (wp.syl.isDone && wp.syl.time > 0) {
            player.currentTime = wp.syl.time / 1000
        }
    })

    function startDrag(mode, startEvent) {
        startEvent.stopPropagation()
        startEvent.preventDefault()

        if (mode === 'move' && (startEvent.ctrlKey || startEvent.metaKey)) {
            const nextSet = new Set(selectedWordIndices)
            if (selectedWordIndex >= 0 && nextSet.size === 0) nextSet.add(selectedWordIndex)
            if (nextSet.has(wp.cursorIdx)) nextSet.delete(wp.cursorIdx)
            else nextSet.add(wp.cursorIdx)
            setMultiWordSelection(Array.from(nextSet), wp.cursorIdx)
            return
        }

        if (mode === 'move' && startEvent.shiftKey && selectedWordIndex >= 0) {
            const minI = Math.min(selectedWordIndex, wp.cursorIdx)
            const maxI = Math.max(selectedWordIndex, wp.cursorIdx)
            const range = []
            for (let i = minI; i <= maxI; i++) {
                if (!allSyllables[i]?.isEndOfLine) range.push(i)
            }
            setMultiWordSelection(range, selectedWordIndex)
            return
        }

        const isPartOfMulti = selectedWordIndices.size > 1 && selectedWordIndices.has(wp.cursorIdx)
        if (!isPartOfMulti) {
            selectedWordIndices = new Set([wp.cursorIdx])
            _userExplicitWordSelect = true
            openWord(wp.cursorIdx)
            setTimeout(() => { _userExplicitWordSelect = false }, 150)
        }

        pushHistoryState()
        const line = tempLyrics[wp.li]
        const syl = wp.syl
        const origStart = (syl.isDone && syl.time > 0) ? syl.time : wp.startMs
        const origDur = (syl.isDone && syl.duration > 0) ? syl.duration : wp.durMs
        const origEnd = origStart + origDur
        const startX = startEvent.clientX
        const startCursorMs = _getTimelineCursorTimeMs(startEvent.clientX)
        const grabOffsetStartMs = origStart - startCursorMs
        const grabOffsetEndMs = origEnd - startCursorMs

        const activeIndices = isPartOfMulti ? Array.from(selectedWordIndices).sort((a, b) => a - b) : [wp.cursorIdx]
        const activeSet = new Set(activeIndices)
        const snapTargets = _collectSnapTargets(activeSet)

        const multiSnaps = activeIndices.map(idx => {
            const entry = allSyllables[idx]
            const lObj = tempLyrics[entry.lineIdx]
            const sObj = lObj?.syllabus[entry.syllabusIdx]
            const wObj = _timelineChipMap.get(idx)
            const sTime = (sObj.isDone && sObj.time > 0) ? sObj.time : (wObj ? wObj.startMs : 0)
            const sDur = (sObj.isDone && sObj.duration > 0) ? sObj.duration : (wObj ? wObj.durMs : 300)
            return { idx, line: lObj, syl: sObj, wp: wObj, origStart: sTime, origDur: sDur, origEnd: sTime + sDur }
        })
        const groupMinStart = Math.min(...multiSnaps.map(m => m.origStart))
        const groupMaxEnd = Math.max(...multiSnaps.map(m => m.origEnd))

        let moved = false

        function onMove(e) {
            if (Math.abs(e.clientX - startX) > 2) moved = true
            const curCursorMs = _getTimelineCursorTimeMs(e.clientX)

            if (isPartOfMulti && multiSnaps.length > 1) {
                const affectedLines = new Set()
                if (mode === 'move') {
                    const snappedAnchor = _snapTimeMs(curCursorMs + grabOffsetStartMs, snapTargets)
                    const minAllowedDiff = -groupMinStart
                    const diff = Math.max(minAllowedDiff, snappedAnchor - origStart)
                    multiSnaps.forEach(m => {
                        m.syl.time = Math.max(0, m.origStart + diff)
                        if (!m.syl.isDone || !m.syl.duration) m.syl.duration = m.origDur
                        m.syl.isDone = true
                        if (m.syl.element) {
                            m.syl.element.classList.add('done-word')
                            m.syl.element.style.setProperty('--duration', m.syl.duration + 'ms')
                        }
                        if (m.wp && m.wp.chipEl) {
                            m.wp.chipEl.classList.remove('is-unsynced')
                            m.wp.chipEl.style.left = Math.round((m.syl.time / 1000) * tlZoom) + 'px'
                        }
                        affectedLines.add(m.line)
                    })
                } else if (mode === 'right') {
                    const snappedCursorEnd = _snapTimeMs(curCursorMs + grabOffsetEndMs, snapTargets)
                    if (e.altKey) {
                        const baseHandleSpan = Math.max(40, origEnd - groupMinStart)
                        const targetHandleSpan = Math.max(60, snappedCursorEnd - groupMinStart)
                        const scale = targetHandleSpan / baseHandleSpan
                        multiSnaps.forEach(m => {
                            m.syl.time = Math.max(0, Math.round(groupMinStart + (m.origStart - groupMinStart) * scale))
                            m.syl.duration = Math.max(40, Math.round(m.origDur * scale))
                            m.syl.isDone = true
                            if (m.syl.element) {
                                m.syl.element.classList.add('done-word')
                                m.syl.element.style.setProperty('--duration', m.syl.duration + 'ms')
                            }
                            if (m.wp && m.wp.chipEl) {
                                m.wp.chipEl.classList.remove('is-unsynced')
                                m.wp.chipEl.style.left = Math.round((m.syl.time / 1000) * tlZoom) + 'px'
                                m.wp.chipEl.style.width = Math.max(26, Math.round((m.syl.duration / 1000) * tlZoom)) + 'px'
                            }
                            affectedLines.add(m.line)
                        })
                    } else {
                        const endDelta = snappedCursorEnd - origEnd
                        multiSnaps.forEach(m => {
                            if (!m.syl.isDone) m.syl.time = m.origStart
                            m.syl.duration = Math.max(40, m.origDur + endDelta)
                            m.syl.isDone = true
                            if (m.syl.element) {
                                m.syl.element.classList.add('done-word')
                                m.syl.element.style.setProperty('--duration', m.syl.duration + 'ms')
                            }
                            if (m.wp && m.wp.chipEl) {
                                m.wp.chipEl.classList.remove('is-unsynced')
                                m.wp.chipEl.style.width = Math.max(26, Math.round((m.syl.duration / 1000) * tlZoom)) + 'px'
                            }
                            affectedLines.add(m.line)
                        })
                    }
                } else if (mode === 'left') {
                    const snappedCursorStart = _snapTimeMs(curCursorMs + grabOffsetStartMs, snapTargets)
                    const startDelta = snappedCursorStart - origStart
                    multiSnaps.forEach(m => {
                        const nextStart = Math.max(0, Math.min(m.origEnd - 40, m.origStart + startDelta))
                        m.syl.time = nextStart
                        m.syl.duration = m.origEnd - nextStart
                        m.syl.isDone = true
                        if (m.syl.element) {
                            m.syl.element.classList.add('done-word')
                            m.syl.element.style.setProperty('--duration', m.syl.duration + 'ms')
                        }
                        if (m.wp && m.wp.chipEl) {
                            m.wp.chipEl.classList.remove('is-unsynced')
                            m.wp.chipEl.style.left = Math.round((m.syl.time / 1000) * tlZoom) + 'px'
                            m.wp.chipEl.style.width = Math.max(26, Math.round((m.syl.duration / 1000) * tlZoom)) + 'px'
                        }
                        affectedLines.add(m.line)
                    })
                }
                affectedLines.forEach(l => _recalcLineBounds(l))
                _updateMultiSelectionPropertiesUI(_getSelectedEntries())
                return
            }

            if (mode === 'move') {
                const nextStart = _snapTimeMs(curCursorMs + grabOffsetStartMs, snapTargets)
                const prevStart = (syl.isDone && syl.time > 0) ? syl.time : origStart
                const diff = nextStart - prevStart
                syl.time = nextStart
                if (!syl.isDone || !syl.duration) syl.duration = origDur
                syl.isDone = true
                chip.classList.remove('is-unsynced')
                chip.style.left = Math.round((nextStart / 1000) * tlZoom) + 'px'

                if ((tlRipple || e.shiftKey) && line && line.syllabus) {
                    const rowTrack = chip.parentElement
                    for (let k = wp.si + 1; k < line.syllabus.length; k++) {
                        const sNext = line.syllabus[k]
                        if (sNext.isDone && sNext.time > 0) {
                            sNext.time = Math.max(0, sNext.time + diff)
                            if (rowTrack && rowTrack.children[k]) {
                                rowTrack.children[k].style.left = Math.round((sNext.time / 1000) * tlZoom) + 'px'
                            }
                        }
                    }
                }
            } else if (mode === 'left') {
                const snappedStart = _snapTimeMs(curCursorMs + grabOffsetStartMs, snapTargets)
                const nextStart = Math.max(0, Math.min(origEnd - 40, snappedStart))
                syl.time = nextStart
                syl.duration = origEnd - nextStart
                syl.isDone = true
                chip.classList.remove('is-unsynced')
                chip.style.left = Math.round((syl.time / 1000) * tlZoom) + 'px'
                chip.style.width = Math.max(26, Math.round((syl.duration / 1000) * tlZoom)) + 'px'
            } else if (mode === 'right') {
                const snappedEnd = _snapTimeMs(curCursorMs + grabOffsetEndMs, snapTargets)
                const nextDur = Math.max(40, snappedEnd - origStart)
                const durDiff = nextDur - (syl.duration || origDur)
                if (!syl.isDone) syl.time = origStart
                syl.duration = nextDur
                syl.isDone = true
                chip.classList.remove('is-unsynced')
                chip.style.width = Math.max(26, Math.round((syl.duration / 1000) * tlZoom)) + 'px'

                if ((tlRipple || e.shiftKey) && line && line.syllabus) {
                    const rowTrack = chip.parentElement
                    for (let k = wp.si + 1; k < line.syllabus.length; k++) {
                        const sNext = line.syllabus[k]
                        if (sNext.isDone && sNext.time > 0) {
                            sNext.time = Math.max(0, sNext.time + durDiff)
                            if (rowTrack && rowTrack.children[k]) {
                                rowTrack.children[k].style.left = Math.round((sNext.time / 1000) * tlZoom) + 'px'
                            }
                        }
                    }
                }
            }

            if (syl.element) {
                syl.element.classList.add('done-word')
                syl.element.style.setProperty('--duration', syl.duration + 'ms')
            }
            _recalcLineBounds(line)
            if (selectedWordIndex === wp.cursorIdx) {
                const stIn = document.getElementById('properties-start')
                const lnIn = document.getElementById('properties-length')
                if (stIn) stIn.value = syl.time
                if (lnIn) lnIn.value = syl.duration
                updateTimeDisplays()
            }
        }

        function onUp() {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            if (moved) {
                renderTimeline()
                if (isPreviewActive()) refreshLyricsPlusPreview()
                _markDirtyAndAutoSave()
            } else if (isPartOfMulti && mode === 'move') {
                selectedWordIndices = new Set([wp.cursorIdx])
                _userExplicitWordSelect = true
                openWord(wp.cursorIdx)
                setTimeout(() => { _userExplicitWordSelect = false }, 150)
            }
        }

        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }

    edgeL.addEventListener('mousedown', e => startDrag('left', e))
    edgeR.addEventListener('mousedown', e => startDrag('right', e))
    chip.addEventListener('mousedown', e => {
        if (e.target === edgeL || e.target === edgeR) return
        startDrag('move', e)
    })
}

function _bindTimelineLineDrag(gutter, trackEl, rm) {
    gutter.addEventListener('mousedown', function (startEvent) {
        startEvent.stopPropagation()
        startEvent.preventDefault()
        const line = tempLyrics[rm.li]
        if (!line || !line.syllabus) return
        pushHistoryState()
        const startX = startEvent.clientX
        const snapUnit = tlSnap ? (editorSettings.snapStepMs || 25) : 1
        const origTimes = rm.chips.map(c => ({
            time: (c.syl.isDone && c.syl.time > 0) ? c.syl.time : c.startMs,
            dur: (c.syl.isDone && c.syl.duration > 0) ? c.syl.duration : c.durMs
        }))
        let moved = false

        function onMove(e) {
            const dx = e.clientX - startX
            if (Math.abs(dx) > 3) moved = true
            if (!moved) return
            const deltaMs = Math.round(((dx / tlZoom) * 1000) / snapUnit) * snapUnit
            line.syllabus.forEach((s, i) => {
                s.time = Math.max(0, origTimes[i].time + deltaMs)
                if (!s.isDone || !s.duration) s.duration = origTimes[i].dur
                s.isDone = true
                if (s.element) {
                    s.element.classList.add('done-word')
                    s.element.style.setProperty('--duration', s.duration + 'ms')
                }
                if (trackEl.children[i]) {
                    trackEl.children[i].classList.remove('is-unsynced')
                    trackEl.children[i].style.left = Math.round((s.time / 1000) * tlZoom) + 'px'
                }
            })
            _recalcLineBounds(line)
        }

        function onUp(upEvent) {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            if (moved) {
                renderTimeline()
                if (isPreviewActive()) refreshLyricsPlusPreview()
                _markDirtyAndAutoSave()
            } else {
                selectTimelineLine(rm.li, upEvent.ctrlKey || upEvent.metaKey, upEvent.shiftKey)
                const vp = document.getElementById('tl-viewport')
                if (vp && rm.chips && rm.chips.length > 0) {
                    const firstPx = Math.round((rm.chips[0].startMs / 1000) * tlZoom)
                    const visW = Math.max(100, vp.clientWidth - 56)
                    if (firstPx < vp.scrollLeft || firstPx > vp.scrollLeft + visW - 100) {
                        vp.scrollTo({ left: Math.max(0, firstPx - 80), behavior: 'smooth' })
                    }
                }
            }
        }

        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    })
}

let _lastWaveRedrawMs = -1
function updateTimelinePlayhead() {
    const playhead = document.getElementById('tl-playhead')
    const readout = document.getElementById('tl-time-readout')
    const curSec = player ? (player.currentTime || 0) : 0
    const curMs = curSec * 1000
    if (readout) readout.textContent = msToDisplayTime(curMs)

    if (currentYoutubeId && player?.duration > 0 && Math.abs(audioDurationSec - player.duration) > 1) {
        _generateSyntheticWaveform(currentYoutubeId, player.duration)
    }

    if (!playhead || centerMode !== 'timeline') return

    const x = Math.round(curSec * tlZoom)
    playhead.style.transform = `translateX(${x}px)`

    if (Math.abs(curMs - _lastWaveRedrawMs) > 60) {
        _lastWaveRedrawMs = curMs
        _drawTimelineWaveform()
    }

    document.querySelectorAll('.tl-word-chip').forEach(chip => {
        const idx = parseInt(chip.dataset.cursorIdx, 10)
        const entry = allSyllables[idx]
        if (!entry || entry.isEndOfLine) return
        const s = tempLyrics[entry.lineIdx]?.syllabus[entry.syllabusIdx]
        const active = !!(s && s.isDone && s.time > 0 && curMs >= s.time && curMs <= s.time + Math.max(s.duration || 0, 180))
        chip.classList.toggle('is-playing', active)
    })

    if (tlFollow && player && !player.paused) {
        const vp = document.getElementById('tl-viewport')
        if (vp) {
            const visibleW = Math.max(100, vp.clientWidth - 56)
            if (x < vp.scrollLeft || x > vp.scrollLeft + visibleW - 80) {
                vp.scrollLeft = Math.max(0, x - Math.round(visibleW * 0.3))
            }
        }
    }
}

;(function _initTimelineEvents() {
    function setup() {
        const ruler = document.getElementById('tl-ruler')
        const waveTrack = document.getElementById('tl-wave-track')
        const rowsBody = document.getElementById('tl-rows-body')
        const stage = document.getElementById('tl-stage')
        const marquee = document.getElementById('tl-marquee-box')
        const vp = document.getElementById('tl-viewport')
        if (!ruler || !vp) return

        function scrub(e) {
            const rect = vp.getBoundingClientRect()
            const x = e.clientX - rect.left - 56 + vp.scrollLeft
            const sec = Math.max(0, x / tlZoom)
            if (player) player.currentTime = sec
            updateTimelinePlayhead()
            _drawTimelineWaveform()
        }

        function bindScrub(el) {
            if (!el) return
            el.addEventListener('mousedown', function (e) {
                e.preventDefault()
                scrub(e)
                function onMove(me) { scrub(me) }
                function onUp() {
                    window.removeEventListener('mousemove', onMove)
                    window.removeEventListener('mouseup', onUp)
                }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
            })
        }

        bindScrub(ruler)
        bindScrub(waveTrack)

        if (rowsBody && stage && marquee) {
            rowsBody.addEventListener('mousedown', function (e) {
                if (e.target.closest('.tl-word-chip') || e.target.closest('.tl-row-gutter')) return
                e.preventDefault()
                const stageRect = stage.getBoundingClientRect()
                const startX = e.clientX - stageRect.left
                const startY = e.clientY - stageRect.top
                const additive = e.shiftKey || e.ctrlKey || e.metaKey
                const baseSet = additive ? new Set(selectedWordIndices) : new Set()
                let dragged = false

                function onMove(me) {
                    const curStageRect = stage.getBoundingClientRect()
                    const curX = me.clientX - curStageRect.left
                    const curY = me.clientY - curStageRect.top
                    if (Math.abs(curX - startX) > 4 || Math.abs(curY - startY) > 4) {
                        dragged = true
                    }
                    if (!dragged) return

                    const left = Math.min(startX, curX)
                    const top = Math.min(startY, curY)
                    const width = Math.abs(curX - startX)
                    const height = Math.abs(curY - startY)

                    marquee.style.display = 'block'
                    marquee.style.left = left + 'px'
                    marquee.style.top = top + 'px'
                    marquee.style.width = width + 'px'
                    marquee.style.height = height + 'px'

                    const boxClientLeft = curStageRect.left + left
                    const boxClientRight = boxClientLeft + width
                    const boxClientTop = curStageRect.top + top
                    const boxClientBottom = boxClientTop + height

                    const hitIndices = new Set(baseSet)
                    document.querySelectorAll('#tl-rows-body .tl-word-chip').forEach(chip => {
                        const r = chip.getBoundingClientRect()
                        const overlaps = !(r.right < boxClientLeft || r.left > boxClientRight || r.bottom < boxClientTop || r.top > boxClientBottom)
                        if (overlaps) {
                            const cIdx = parseInt(chip.dataset.cursorIdx, 10)
                            if (!isNaN(cIdx)) hitIndices.add(cIdx)
                        }
                    })
                    const arr = Array.from(hitIndices).sort((a, b) => a - b)
                    if (arr.length > 0) {
                        setMultiWordSelection(arr, arr[0])
                    } else if (!additive) {
                        unselect()
                    }
                }

                function onUp() {
                    window.removeEventListener('mousemove', onMove)
                    window.removeEventListener('mouseup', onUp)
                    marquee.style.display = 'none'
                    if (!dragged && !additive) {
                        unselect()
                    }
                }

                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
            })
        }

        vp.addEventListener('scroll', function () {
            _drawTimelineWaveform()
        }, { passive: true })

        vp.addEventListener('mousemove', function (e) {
            _lastTimelineMouseX = e.clientX
        }, { passive: true })

        vp.addEventListener('mouseleave', function () {
            _lastTimelineMouseX = null
        }, { passive: true })

        vp.addEventListener('wheel', function (e) {
            if (e.ctrlKey || e.metaKey || e.altKey) {
                e.preventDefault()
                timelineZoom(e.deltaY < 0 ? 20 : -20, e.clientX)
            }
        }, { passive: false })

        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(() => {
                if (centerMode === 'timeline') _drawTimelineWaveform()
            })
            ro.observe(vp)
        }

        renderTimeline()
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup)
    } else {
        setup()
    }
})()

function toggleHomePage(forceShow) {
    const hp = document.getElementById('home-page')
    const me = document.getElementById('app')
    const btn = document.getElementById('btn-nav-home')
    const navBar = document.getElementById('navbar')
    const hintBadge = document.getElementById('kmake-hint-badge')
    if (!hp || !me) return
    const isShowing = forceShow !== undefined ? forceShow : (hp.style.display === 'none')
    if (isShowing) {
        saveCurrentProjectToStorage()
        hp.style.display = 'flex'
        me.style.display = 'none'
        if (navBar) navBar.style.display = 'none'
        if (hintBadge) hintBadge.style.display = 'none'
        document.querySelectorAll('.editor-menu-btn').forEach(el => { el.style.display = 'none' })
        if (btn) btn.setAttribute('data-active', 'true')
        renderHomeProjectsList()
    } else {
        hp.style.display = 'none'
        me.style.display = 'flex'
        if (navBar) navBar.style.display = ''
        document.querySelectorAll('.editor-menu-btn').forEach(el => { el.style.display = '' })
        if (btn) btn.removeAttribute('data-active')
    }
}

function renderHomeProjectsList() {
    const body = document.getElementById('home-projects-list')
    if (!body) return

    const paintList = (list) => {
        if (!list || list.length === 0) {
            body.innerHTML = `
                <div class="home-empty-box">
                    <i data-lucide="folder-kanban"></i>
                    <div style="font-size:0.95rem;font-weight:600;color:var(--md-sys-color-on-surface)">No saved projects yet</div>
                    <div style="font-size:0.8rem;max-width:380px;color:var(--md-sys-color-on-surface-variant)">Create a new project or import an existing KPoe JSON, Apple Music TTML, LRC, or .kmake bundle to start syncing.</div>
                </div>
            `
            if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [body] })
            return
        }

        const rowsHtml = list.map(proj => {
            const isCurrent = proj.id === currentProjectId && (tempLyrics.length > 0 || (elem_lyricsInput && elem_lyricsInput.value.trim() !== ''))
            const pct = proj.totalSyls > 0 ? Math.round((proj.syncedSyls / proj.totalSyls) * 100) : 0
            const dateStr = new Date(proj.updatedAt || Date.now()).toLocaleString([], {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            })
            return `
                <div class="project-row-card ${isCurrent ? 'active-project' : ''}" onclick="openSavedProject('${escapeHtmlAttr(proj.id)}')">
                    <div class="project-row-left">
                        <div class="project-row-icon">
                            <i data-lucide="${isCurrent ? 'disc-3' : 'music'}"></i>
                        </div>
                        <div class="project-row-meta">
                            <div class="project-row-title">
                                ${escapeHtmlAttr(proj.title || 'Untitled Project')}
                                ${isCurrent ? '<span class="project-badge">Active</span>' : ''}
                            </div>
                            <div class="project-row-sub">
                                ${escapeHtmlAttr(proj.artist || 'Unknown Artist')} &nbsp;·&nbsp; ${proj.lineCount || 0} lines &nbsp;·&nbsp; ${pct}% synced &nbsp;·&nbsp; Auto-saved ${escapeHtmlAttr(dateStr)}
                            </div>
                        </div>
                    </div>
                    <div class="project-row-actions" onclick="event.stopPropagation()">
                        <button class="btn-secondary" onclick="deleteSavedProject('${escapeHtmlAttr(proj.id)}')" title="Delete Project"><i data-lucide="trash-2"></i></button>
                    </div>
                </div>
            `
        }).join('')

        body.innerHTML = `<div class="home-section-label">Saved Projects (${list.length})</div>` + rowsHtml
        if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [body] })
    }

    const syncList = _getSavedProjectsList()
    paintList(syncList)

    _idbGetAllProjects().then(idbList => {
        if (idbList && idbList.length > 0) {
            const mergedMap = new Map()
            syncList.forEach(p => mergedMap.set(p.id, p))
            idbList.forEach(p => {
                const prev = mergedMap.get(p.id)
                if (!prev || (p.updatedAt || 0) >= (prev.updatedAt || 0)) {
                    mergedMap.set(p.id, p)
                }
            })
            const merged = Array.from(mergedMap.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
            _saveProjectsList(merged)
            paintList(merged)
        }
    })
}

function createNewProjectFromHome() {
    createNewProject(true)
}

function importProjectFromHome() {
    saveCurrentProjectToStorage()
    importAnyLyricsFile(() => {
        saveCurrentProjectToStorage()
        toggleHomePage(false)
    })
}

function _applyLoadedProjectObject(proj) {
    if (!proj) return
    currentProjectId = proj.id
    tempLyrics = (proj.tempLyrics || []).map(l => ({
        ...l,
        lineElement: null,
        syllabus: (l.syllabus || []).map(s => ({ ...s, element: null }))
    }))
    metadata = proj.metadata ? JSON.parse(JSON.stringify(proj.metadata)) : metadata
    elem_lyricsInput.value = proj.plainText || ''
    const musicTitleEl = document.getElementById('music-title')
    const musicArtistEl = document.getElementById('music-artist')
    const musicAlbumEl = document.getElementById('music-album')
    const musicArtEl = document.getElementById('music-album-art')
    if (musicTitleEl) musicTitleEl.innerText = metadata.title || ''
    if (musicArtistEl) musicArtistEl.innerText = metadata.artist || ''
    if (musicAlbumEl) musicAlbumEl.innerText = metadata.album || ''
    if (musicArtEl) musicArtEl.src = proj.artSrc || ''

    if (proj.audioBlob && (proj.audioBlob instanceof Blob)) {
        music_file = proj.audioBlob
        const blobUrl = URL.createObjectURL(proj.audioBlob)
        player.source = {
            type: 'audio',
            title: metadata.title || 'Restored Audio',
            sources: [{ src: blobUrl, type: proj.audioBlob.type || 'audio/mp3' }]
        }
        _decodeAudioWaveform(proj.audioBlob)
    } else if (proj.currentYoutubeId) {
        currentYoutubeId = proj.currentYoutubeId
        player.source = {
            type: 'video',
            sources: [{ src: proj.currentYoutubeId, provider: 'youtube' }]
        }
        _generateSyntheticWaveform(proj.currentYoutubeId, 210)
    } else {
        music_file = null
        currentYoutubeId = ''
        audioPeaks = null
        audioDurationSec = 0
        if (player) {
            try { player.stop() } catch (e) {}
            player.source = { type: 'audio', sources: [] }
        }
    }

    if (tempLyrics.length === 0 && elem_lyricsInput.value.trim() !== '') {
        parseLyrics()
    } else {
        rebuildLyricsDOM()
        buildAllSyllables()
        _seekToFirstUnsynced()
        renderTimeline()
    }
    _updatePreviewSongCard()
    if (isPreviewActive()) refreshLyricsPlusPreview()
    toggleHomePage(false)
}

function openSavedProject(projId) {
    saveCurrentProjectToStorage()
    _idbGetProject(projId).then(idbProj => {
        if (idbProj) {
            _applyLoadedProjectObject(idbProj)
            return
        }
        const list = _getSavedProjectsList()
        const proj = list.find(p => p.id === projId)
        if (proj) _applyLoadedProjectObject(proj)
    })
}

function deleteSavedProject(projId) {
    if (typeof editorSettings !== 'undefined' && editorSettings.confirmReset) {
        if (!confirm('Are you sure you want to delete this project?')) return
    }
    const list = _getSavedProjectsList().filter(p => p.id !== projId)
    _saveProjectsList(list)
    _idbDeleteProject(projId)
    if (currentProjectId === projId) {
        currentProjectId = 'proj_' + Date.now()
        reset(true)
    }
    renderHomeProjectsList()
}

function openSettingsModal(initialCategory) {
    const existing = document.getElementById('settings-modal')
    if (existing) existing.remove()
    if (initialCategory) _activeSettingsCategory = initialCategory

    const categories = [
        { id: 'general', label: 'General', icon: 'settings' },
        { id: 'theme', label: 'Theme', icon: 'palette' },
        { id: 'playback', label: 'Playback', icon: 'play' },
        { id: 'timeline', label: 'Timeline', icon: 'sliders-horizontal' },
        { id: 'sync', label: 'Sync & Timing', icon: 'clock' },
        { id: 'shortcuts', label: 'Shortcuts', icon: 'keyboard' },
        { id: 'confirmations', label: 'Confirmations', icon: 'alert-triangle' },
        { id: 'storage', label: 'Save & Storage', icon: 'save' }
    ]

    const navHtml = categories.map(cat => `
        <button class="settings-nav-tag ${_activeSettingsCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}" onclick="switchSettingsCategory('${cat.id}')">
            <i data-lucide="${cat.icon}"></i>
            <span>${cat.label}</span>
        </button>
    `).join('')

    const modal = document.createElement('div')
    modal.id = 'settings-modal'
    modal.className = 'kmake-modal'
    modal.innerHTML = `
        <div class="kmake-modal-backdrop" onclick="closeSettingsModal()"></div>
        <div class="kmake-modal-content settings-modal-box">
            <div class="kmake-modal-header">
                <h2>Settings</h2>
                <button onclick="closeSettingsModal()" class="modal-close-btn"><i data-lucide="x"></i></button>
            </div>
            <div class="settings-split-body">
                <div class="settings-sidebar">
                    <div class="settings-search-wrap">
                        <i data-lucide="search" style="width:14px;height:14px;color:var(--md-sys-color-on-surface-variant);flex-shrink:0"></i>
                        <input type="text" id="settings-search-input" class="settings-search-input" placeholder="Search settings" oninput="filterSettingsModal(this.value)" />
                        <span class="settings-search-Slash">/</span>
                    </div>
                    <div id="settings-nav-list" style="display:flex;flex-direction:column;gap:2px">
                        ${navHtml}
                    </div>
                </div>
                <div class="settings-pane" id="settings-main-pane"></div>
            </div>
            <div class="settings-auto-footer">
                Settings are saved automatically
            </div>
        </div>
    `
    document.body.appendChild(modal)
    renderSettingsCategoryPane(_activeSettingsCategory, '')
    requestAnimationFrame(() => { modal.classList.add('visible'); lucide.createIcons({ nodes: [modal] }) })
}

function switchSettingsCategory(catId) {
    _activeSettingsCategory = catId
    const searchInput = document.getElementById('settings-search-input')
    if (searchInput && searchInput.value) searchInput.value = ''
    document.querySelectorAll('#settings-nav-list .settings-nav-tag').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === catId)
    })
    renderSettingsCategoryPane(catId, '')
}

function filterSettingsModal(query) {
    renderSettingsCategoryPane(_activeSettingsCategory, (query || '').trim().toLowerCase())
}

function _buildSettingsSwitch(checked, onChangeCode) {
    return `<label class="m3-switch"><input type="checkbox" ${checked ? 'checked' : ''} onchange="${onChangeCode}" /><span class="m3-slider"></span></label>`
}

function renderSettingsCategoryPane(catId, searchQuery) {
    const pane = document.getElementById('settings-main-pane')
    if (!pane) return

    const allItems = [
        {
            cat: 'general',
            title: 'Show syllable indicators',
            desc: 'Visually group syllables split from one word.',
            control: _buildSettingsSwitch(editorSettings.showSyllableIndicators, "editorSettings.showSyllableIndicators = this.checked; _saveEditorSettings()")
        },
        {
            cat: 'general',
            title: 'Auto-extract background vocals',
            desc: 'Move parenthesised text into background vocals when lyrics are pasted, imported, or edited.',
            control: _buildSettingsSwitch(editorSettings.autoExtractBg, "editorSettings.autoExtractBg = this.checked; _saveEditorSettings()")
        },
        {
            cat: 'general',
            title: 'Preserve brackets when extracting',
            desc: 'Keep parentheses around extracted background vocals. Multiple snippets share one outer pair.',
            control: _buildSettingsSwitch(editorSettings.preserveBgBrackets, "editorSettings.preserveBgBrackets = this.checked; _saveEditorSettings()")
        },
        {
            cat: 'general',
            title: 'Reset product tour',
            desc: 'Restart the guided walkthrough and shortcut hint banner.',
            control: `<button class="settings-pill-btn" onclick="closeSettingsModal(); startInteractiveWalkthrough()"><i data-lucide="route"></i> Reset tour</button>`
        },
        {
            cat: 'general',
            title: 'Reset to defaults',
            desc: 'Restore all settings and keybindings to their original values.',
            control: `<button class="settings-pill-btn" onclick="resetAllSettingsToDefaults()"><i data-lucide="rotate-ccw"></i> Reset all</button>`
        },
        {
            cat: 'theme',
            title: 'Blurred artwork background in Preview',
            desc: 'Use blurred album artwork behind the LyricsPlusRenderer preview instead of a solid surface.',
            control: _buildSettingsSwitch(editorSettings.previewBlurredArt !== false, "editorSettings.previewBlurredArt = this.checked; _saveEditorSettings(); _updatePreviewSongCard()")
        },
        {
            cat: 'theme',
            title: 'Word-by-word karaoke wipe',
            desc: 'Enable syllable gradient wipe and character emphasis in LyricsPlusRenderer preview.',
            control: _buildSettingsSwitch(window.currentSettings.wordByWord, "window.currentSettings.wordByWord = this.checked; if(isPreviewActive()) refreshLyricsPlusPreview()")
        },
        {
            cat: 'theme',
            title: 'Blur inactive lines',
            desc: 'Apply depth-of-field blur to non-active lyric lines in preview mode.',
            control: _buildSettingsSwitch(window.currentSettings.blurInactive, "window.currentSettings.blurInactive = this.checked; if(isPreviewActive()) refreshLyricsPlusPreview()")
        },
        {
            cat: 'theme',
            title: 'Relaxed spring scroll',
            desc: 'Use gentler line scaling and smoother scroll transitions in preview.',
            control: _buildSettingsSwitch(window.currentSettings.relaxScroll, "window.currentSettings.relaxScroll = this.checked; if(isPreviewActive()) refreshLyricsPlusPreview()")
        },
        {
            cat: 'theme',
            title: 'Lightweight preview renderer',
            desc: 'Reduce per-character glow animations on long emphasized words.',
            control: _buildSettingsSwitch(window.currentSettings.lightweight, "window.currentSettings.lightweight = this.checked; if(isPreviewActive()) refreshLyricsPlusPreview()")
        },
        {
            cat: 'playback',
            title: 'Playback speed',
            desc: 'Adjust audio/video playback speed for easier rapid syllable syncing.',
            control: `<select class="props-agent-select" style="width:110px" onchange="if(player) player.speed = parseFloat(this.value)">
                <option value="0.5" ${player?.speed === 0.5 ? 'selected' : ''}>0.5×</option>
                <option value="0.75" ${player?.speed === 0.75 ? 'selected' : ''}>0.75×</option>
                <option value="1" ${(!player || player.speed === 1) ? 'selected' : ''}>1.0× (Normal)</option>
                <option value="1.25" ${player?.speed === 1.25 ? 'selected' : ''}>1.25×</option>
                <option value="1.5" ${player?.speed === 1.5 ? 'selected' : ''}>1.5×</option>
            </select>`
        },
        {
            cat: 'playback',
            title: 'Step-back rewind offset (seconds)',
            desc: 'How far to rewind audio when stepping back a syllable.',
            control: `<input type="number" step="0.1" class="props-raw-input" style="max-width:86px" value="${editorSettings.rewindOffsetSec}" onchange="editorSettings.rewindOffsetSec = Math.max(0.2, parseFloat(this.value)||1.2); _saveEditorSettings()" />`
        },
        {
            cat: 'timeline',
            title: 'Follow playhead automatically',
            desc: 'Keep the active playhead centered in the timeline viewport during playback.',
            control: _buildSettingsSwitch(tlFollow, "toggleTimelineFollow()")
        },
        {
            cat: 'timeline',
            title: 'Snap to grid & syllable edges',
            desc: 'Quantize dragged syllables to grid intervals and neighboring word boundaries.',
            control: _buildSettingsSwitch(tlSnap, "toggleTimelineSnap()")
        },
        {
            cat: 'timeline',
            title: 'Rolling / ripple edit',
            desc: 'Shift subsequent syllables in the same line when moving or resizing a word.',
            control: _buildSettingsSwitch(tlRipple, "toggleTimelineRipple()")
        },
        {
            cat: 'timeline',
            title: 'Timeline grid snap step (ms)',
            desc: 'Quantization interval in milliseconds when timeline snapping is enabled.',
            control: `<input type="number" class="props-raw-input" style="max-width:86px" value="${editorSettings.snapStepMs}" onchange="editorSettings.snapStepMs = Math.max(5, parseInt(this.value)||25); _saveEditorSettings()" />`
        },
        {
            cat: 'sync',
            title: 'Allow empty line, double-space, or ]] as word-end rest (- ♪ -)',
            desc: 'Treat empty lines, multiple spaces, or ]] as an empty rest syllable (- ♪ -) to seal the previous word duration (off by default).',
            control: _buildSettingsSwitch(editorSettings.allowSpaceDoubleBracketEndWord, "editorSettings.allowSpaceDoubleBracketEndWord = this.checked; _saveEditorSettings(); if (elem_lyricsInput && elem_lyricsInput.value.trim()) parseLyrics()")
        },
        {
            cat: 'sync',
            title: 'Tap reaction latency compensation (ms)',
            desc: 'Offset applied when stamping words in Sync mode (e.g. -35ms for human reaction time).',
            control: `<input type="number" class="props-raw-input" style="max-width:86px" value="${editorSettings.tapLatencyMs}" onchange="editorSettings.tapLatencyMs = parseInt(this.value)||0; _saveEditorSettings()" />`
        },
        {
            cat: 'sync',
            title: 'Hold-to-seal duration threshold (ms)',
            desc: 'Holding the Stamp key longer than this seals the syllable duration on key release.',
            control: `<input type="number" class="props-raw-input" style="max-width:86px" value="${editorSettings.holdThresholdMs}" onchange="editorSettings.holdThresholdMs = Math.max(80, parseInt(this.value)||180); _saveEditorSettings()" />`
        },
        ...[
            ['stampWord', 'Stamp / Next Word', 'Stamp current syllable start time and advance to next syllable.'],
            ['endWord', 'End Current Word Duration', 'Seal the end time of the active or selected syllable at playhead.'],
            ['stepBack', 'Step Back 1 Word & Rewind', 'Undo the last stamped syllable and rewind audio slightly.'],
            ['playPause', 'Play / Pause Audio', 'Toggle audio playback while syncing or editing.'],
            ['prevWord', 'Seek Previous Word', 'Seek audio backward to the previous synced syllable.'],
            ['nextWordNav', 'Seek Next Word', 'Seek audio forward to the next synced syllable.'],
            ['toggleBg', 'Toggle Background Vocal', 'Mark or unmark the selected syllable or parenthesised run as background vocal.'],
            ['tlFollow', 'Timeline: Follow Playhead', 'Toggle automatic playhead following in Timeline view.'],
            ['tlRolling', 'Timeline: Rolling Edit', 'Toggle ripple editing for subsequent syllables in Timeline view.'],
            ['tlSnap', 'Timeline: Snap to Grid', 'Toggle grid snapping in Timeline view.']
        ].map(([key, label, desc]) => ({
            cat: 'shortcuts',
            title: label,
            desc: desc,
            control: `<button type="button" class="shortcut-bind-btn" data-sc-key="${key}" onclick="startShortcutRecord(this, '${key}')">${escapeHtmlAttr(userShortcuts[key] || DEFAULT_SHORTCUTS[key])}</button>`
        })),
        {
            cat: 'confirmations',
            title: 'Warn before closing tab',
            desc: 'Show a browser confirmation prompt when closing or reloading with unsaved changes.',
            control: _buildSettingsSwitch(editorSettings.warnOnClose, "editorSettings.warnOnClose = this.checked; _saveEditorSettings()")
        },
        {
            cat: 'confirmations',
            title: 'Confirm before Reset All',
            desc: 'Ask for confirmation before clearing lyrics and audio in the editor.',
            control: _buildSettingsSwitch(editorSettings.confirmReset, "editorSettings.confirmReset = this.checked; _saveEditorSettings()")
        },
        {
            cat: 'storage',
            title: 'Auto-save projects to browser (IndexedDB)',
            desc: 'Automatically persist your active project and audio file in IndexedDB for instant crash recovery.',
            control: _buildSettingsSwitch(editorSettings.autoSaveDraft, "editorSettings.autoSaveDraft = this.checked; _saveEditorSettings()")
        },
        {
            cat: 'storage',
            title: 'Clear saved browser projects',
            desc: 'Remove all saved projects from IndexedDB and local browser storage.',
            control: `<button class="settings-pill-btn" onclick="try{localStorage.removeItem('kmake_projects_list_v1')}catch(e){}; _memoryProjectsList=[]; _idbClearAllProjects(); renderHomeProjectsList()"><i data-lucide="trash-2"></i> Clear storage</button>`
        }
    ]

    const visibleItems = searchQuery
        ? allItems.filter(it => it.title.toLowerCase().includes(searchQuery) || it.desc.toLowerCase().includes(searchQuery))
        : allItems.filter(it => it.cat === catId)

    if (visibleItems.length === 0) {
        pane.innerHTML = `<div style="padding:32px;text-align:center;color:var(--md-sys-color-on-surface-variant);font-size:0.84rem">No settings match "${escapeHtmlAttr(searchQuery)}"</div>`
        return
    }

    pane.innerHTML = visibleItems.map(it => `
        <div class="settings-item-row">
            <div class="settings-item-info">
                <span class="settings-item-title">${it.title}</span>
                <span class="settings-item-desc">${it.desc}</span>
            </div>
            ${it.control}
        </div>
    `).join('')
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [pane] })
}

function startShortcutRecord(btn, keyId) {
    if (btn && typeof btn.blur === 'function') btn.blur()
    document.querySelectorAll('.shortcut-bind-btn.recording').forEach(b => {
        b.classList.remove('recording')
        const k = b.dataset.scKey
        b.textContent = userShortcuts[k] || DEFAULT_SHORTCUTS[k]
    })
    _recordingShortcutKey = keyId
    btn.classList.add('recording')
    btn.textContent = 'Press key…'
}

function _finishShortcutRecord(event) {
    if (!_recordingShortcutKey) return
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return
    if (event.key === 'Escape') {
        _recordingShortcutKey = null
        document.querySelectorAll('.shortcut-bind-btn.recording').forEach(b => {
            b.classList.remove('recording')
            const k = b.dataset.scKey
            b.textContent = userShortcuts[k] || DEFAULT_SHORTCUTS[k]
        })
        return
    }
    const combo = _eventToCombo(event)
    if (!combo) return
    userShortcuts[_recordingShortcutKey] = combo
    const btn = document.querySelector(`.shortcut-bind-btn[data-sc-key="${_recordingShortcutKey}"]`)
    if (btn) {
        btn.classList.remove('recording')
        btn.textContent = combo
    }
    _recordingShortcutKey = null
    _saveUserShortcuts()
}

function resetShortcutsToDefault() {
    userShortcuts = { ...DEFAULT_SHORTCUTS }
    _saveUserShortcuts()
    renderSettingsCategoryPane(_activeSettingsCategory, '')
}

function resetAllSettingsToDefaults() {
    userShortcuts = { ...DEFAULT_SHORTCUTS }
    editorSettings = { ...DEFAULT_EDITOR_SETTINGS }
    _saveUserShortcuts()
    _saveEditorSettings()
    _updatePreviewSongCard()
    renderSettingsCategoryPane(_activeSettingsCategory, '')
}

function closeSettingsModal() {
    _recordingShortcutKey = null
    const modal = document.getElementById('settings-modal')
    if (!modal) return
    modal.classList.remove('visible')
    setTimeout(() => modal.remove(), 200)
}

function openTranslitModal() {
    const existing = document.getElementById('translit-modal')
    if (existing) existing.remove()

    const lyricLines = tempLyrics.map((l, li) => ({ l, li })).filter(x => !x.l.isTaggedLine && (x.l.text || '').trim() !== '')
    const romBulk = lyricLines.map(({ l }) => _syllabusToMarkup(l.syllabus.map(s => ({ text: s.romanizedText || s.text })), l.romanizedText || '')).join('\n')
    const trBulk = lyricLines.map(({ l }) => l.translatedText || '').join('\n')

    const modal = document.createElement('div')
    modal.id = 'translit-modal'
    modal.className = 'kmake-modal'
    modal.innerHTML = `
        <div class="kmake-modal-backdrop" onclick="this.closest('.kmake-modal').remove()"></div>
        <div class="kmake-modal-content" style="max-width:740px">
            <div class="kmake-modal-header">
                <i data-lucide="languages" class="modal-header-icon"></i>
                <h2>Syllable Romanization &amp; Translation Editor</h2>
                <button onclick="this.closest('.kmake-modal').remove()" class="modal-close-btn"><i data-lucide="x"></i></button>
            </div>
            <div class="tutorial-tabs">
                <button class="tutorial-tab active" onclick="switchTutorialTab(this, 'tab-translit-syllables')">Per-Syllable Editor</button>
                <button class="tutorial-tab" onclick="switchTutorialTab(this, 'tab-translit-bulk')">Bulk Line Paste</button>
            </div>
            <div class="kmake-modal-body" style="max-height:66vh">
                <div id="tab-translit-syllables" class="tutorial-tab-panel active" style="padding:0;gap:10px">
                    <p class="modal-hint" style="margin:0">Each syllable has its own <code>romanizedText</code> (matching LyricsPlusRenderer format) plus optional line translation.</p>
                    <div id="translit-lines-container" style="display:flex;flex-direction:column;gap:10px"></div>
                </div>
                <div id="tab-translit-bulk" class="tutorial-tab-panel" style="padding:0;gap:12px">
                    <p class="modal-hint" style="margin:0">Paste 1 line per lyric line. Use <code>]</code> or spaces in Romanization to map directly to each syllable.</p>
                    <div class="meta-row">
                        <div class="meta-field">
                            <label>Bulk Romanization (${lyricLines.length} lines)</label>
                            <textarea id="bulk-rom-textarea" style="height:220px;background:var(--md-sys-color-surface-container-highest);border:1px solid var(--md-sys-color-outline-variant);border-radius:8px;color:var(--md-sys-color-on-surface);padding:8px;font-family:monospace;font-size:0.8rem">${escapeHtmlAttr(romBulk)}</textarea>
                        </div>
                        <div class="meta-field">
                            <label>Bulk Translation (${lyricLines.length} lines)</label>
                            <textarea id="bulk-tr-textarea" style="height:220px;background:var(--md-sys-color-surface-container-highest);border:1px solid var(--md-sys-color-outline-variant);border-radius:8px;color:var(--md-sys-color-on-surface);padding:8px;font-family:monospace;font-size:0.8rem">${escapeHtmlAttr(trBulk)}</textarea>
                        </div>
                    </div>
                    <button class="btn-primary" style="align-self:flex-end" onclick="applyBulkTranslitAndTranslation()">Apply Bulk Text to All Syllables</button>
                </div>
            </div>
            <div class="kmake-modal-footer">
                <button class="btn-primary" onclick="saveTranslitModal()">Done</button>
            </div>
        </div>
    `
    document.body.appendChild(modal)

    const cont = modal.querySelector('#translit-lines-container')
    lyricLines.forEach(({ l, li }, idx) => {
        const row = document.createElement('div')
        row.className = 'translit-line-row'
        const sylCells = (l.syllabus || []).map((s, si) => {
            const cleanOrig = (s.text || '').replace(/]/g, '')
            const curRom = (s.romanizedText || '').trim()
            return `<div class="translit-syl-cell">
                <span class="translit-syl-orig">${escapeHtmlAttr(cleanOrig)}</span>
                <input type="text" class="translit-syl-in" data-li="${li}" data-si="${si}" value="${escapeHtmlAttr(curRom)}" placeholder="${escapeHtmlAttr(cleanOrig.trim())}" />
            </div>`
        }).join('')
        row.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                <span style="font-size:0.78rem;font-weight:600;color:var(--md-sys-color-on-surface)">#${idx + 1} · ${escapeHtmlAttr((l.text || '').replace(/]/g, ''))}</span>
                <input type="text" class="props-mini-input translit-line-tr-in" data-li="${li}" value="${escapeHtmlAttr(l.translatedText || '')}" placeholder="Line translation…" style="max-width:240px" />
            </div>
            <div class="translit-syl-grid">${sylCells}</div>
        `
        cont.appendChild(row)
    })

    requestAnimationFrame(() => { modal.classList.add('visible'); lucide.createIcons({ nodes: [modal] }) })
}

function applyBulkTranslitAndTranslation() {
    const romArea = document.getElementById('bulk-rom-textarea')
    const trArea = document.getElementById('bulk-tr-textarea')
    const romLines = (romArea?.value || '').split('\n')
    const trLines = (trArea?.value || '').split('\n')
    pushHistoryState()
    let cursor = 0
    tempLyrics.forEach(l => {
        if (!l || l.isTaggedLine || !(l.text || '').trim()) return
        if (romLines[cursor] !== undefined) {
            _distributeRomanizationOnLine(l, romLines[cursor])
        }
        if (trLines[cursor] !== undefined) {
            l.translatedText = trLines[cursor].trim() || undefined
        }
        cursor++
    })
    _markDirtyAndAutoSave()
    if (isPreviewActive()) refreshLyricsPlusPreview()
    document.getElementById('translit-modal')?.remove()
}

function saveTranslitModal() {
    const modal = document.getElementById('translit-modal')
    if (!modal) return
    pushHistoryState()
    modal.querySelectorAll('.translit-syl-in').forEach(inp => {
        const li = parseInt(inp.dataset.li, 10)
        const si = parseInt(inp.dataset.si, 10)
        const line = tempLyrics[li]
        const syl = line?.syllabus[si]
        if (!syl) return
        const origClean = (syl.text || '').replace(/]/g, '')
        const trail = (origClean.match(/\s+$/) || [''])[0]
        const val = inp.value.trim()
        syl.romanizedText = val ? (val + trail) : undefined
    })
    modal.querySelectorAll('.translit-line-tr-in').forEach(inp => {
        const li = parseInt(inp.dataset.li, 10)
        const line = tempLyrics[li]
        if (line) line.translatedText = inp.value.trim() || undefined
    })
    tempLyrics.forEach(l => {
        if (!l || l.isTaggedLine || !l.syllabus) return
        if (l.syllabus.some(s => s.romanizedText)) {
            l.romanizedText = l.syllabus.map(s => s.romanizedText || (s.text || '').replace(/]/g, '')).join('')
        } else {
            l.romanizedText = undefined
        }
    })
    modal.remove()
    if (selectedWordIndex !== -1) openWord(selectedWordIndex)
    _markDirtyAndAutoSave()
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function openTimingToolsModal() {
    const existing = document.getElementById('timing-tools-modal')
    if (existing) existing.remove()

    const modal = document.createElement('div')
    modal.id = 'timing-tools-modal'
    modal.className = 'kmake-modal'
    modal.innerHTML = `
        <div class="kmake-modal-backdrop" onclick="this.closest('.kmake-modal').remove()"></div>
        <div class="kmake-modal-content" style="max-width:440px">
            <div class="kmake-modal-header">
                <i data-lucide="sliders" class="modal-header-icon"></i>
                <h2>Batch Shift &amp; Scale Timings</h2>
                <button onclick="this.closest('.kmake-modal').remove()" class="modal-close-btn"><i data-lucide="x"></i></button>
            </div>
            <div class="kmake-modal-body">
                <div class="meta-field">
                    <label>Target Scope</label>
                    <select id="batch-scope-sel" class="props-agent-select">
                        <option value="all">All Synced Lyrics</option>
                        <option value="selected" ${selectedWordIndices.size > 1 ? 'selected' : ''}>Selected Syllables (${Math.max(1, selectedWordIndices.size)})</option>
                        <option value="forward">From Selected Word Onward</option>
                        <option value="line">Selected Line Only</option>
                    </select>
                </div>
                <div class="meta-field">
                    <label>Shift Offset (ms)</label>
                    <div class="props-nudge-row">
                        <button class="nudge-btn" onclick="document.getElementById('batch-shift-ms').value = (parseInt(document.getElementById('batch-shift-ms').value)||0) - (event.shiftKey ? 250 : 50)" title="-50ms (Shift: -250ms)">−50</button>
                        <input type="number" id="batch-shift-ms" class="props-raw-input" value="0" />
                        <button class="nudge-btn" onclick="document.getElementById('batch-shift-ms').value = (parseInt(document.getElementById('batch-shift-ms').value)||0) + (event.shiftKey ? 250 : 50)" title="+50ms (Shift: +250ms)">+50</button>
                    </div>
                </div>
            </div>
            <div class="kmake-modal-footer">
                <button class="btn-primary" onclick="applyBatchShiftModal()">Apply Shift</button>
                <button class="btn-secondary" onclick="this.closest('.kmake-modal').remove()">Cancel</button>
            </div>
        </div>
    `
    document.body.appendChild(modal)
    requestAnimationFrame(() => { modal.classList.add('visible'); lucide.createIcons({ nodes: [modal] }) })
}

function applyBatchShiftModal() {
    const scope = document.getElementById('batch-scope-sel')?.value || 'all'
    const offset = parseInt(document.getElementById('batch-shift-ms')?.value, 10) || 0
    if (!offset) return
    if (scope === 'selected') {
        shiftSelectedLine(offset)
        document.getElementById('timing-tools-modal')?.remove()
        return
    }
    pushHistoryState()
    if (scope === 'all') {
        tempLyrics.forEach(l => {
            if (l.isTaggedLine) return
            ;(l.syllabus || []).forEach(s => {
                if (s.isDone && s.time > 0) s.time = Math.max(0, s.time + offset)
            })
            _recalcLineBounds(l)
        })
    } else if (scope === 'line' && selectedWordIndex >= 0) {
        shiftSelectedLine(offset)
        document.getElementById('timing-tools-modal')?.remove()
        return
    } else if (scope === 'forward') {
        const startIdx = Math.max(0, selectedWordIndex)
        for (let i = startIdx; i < allSyllables.length; i++) {
            const entry = allSyllables[i]
            if (entry.isEndOfLine) continue
            const s = tempLyrics[entry.lineIdx]?.syllabus[entry.syllabusIdx]
            if (s && s.isDone && s.time > 0) s.time = Math.max(0, s.time + offset)
        }
        tempLyrics.forEach(l => _recalcLineBounds(l))
    }
    document.getElementById('timing-tools-modal')?.remove()
    if (selectedWordIndex >= 0) openWord(selectedWordIndex)
    _markDirtyAndAutoSave()
    renderTimeline()
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function applyRepeatedLineTimings() {
    const syncedTemplates = new Map()
    tempLyrics.forEach(l => {
        if (!l || l.isTaggedLine || !l.syllabus || !l.syllabus.length) return
        const norm = cleanText(l.text)
        if (!norm) return
        const allDone = l.syllabus.every(s => s.isDone && s.time > 0 && s.duration > 0)
        if (allDone && !syncedTemplates.has(norm)) {
            syncedTemplates.set(norm, l)
        }
    })
    if (syncedTemplates.size === 0) {
        return
    }
    pushHistoryState()
    let updatedCount = 0
    tempLyrics.forEach((l) => {
        if (!l || l.isTaggedLine || !l.syllabus || !l.syllabus.length) return
        const norm = cleanText(l.text)
        const tpl = syncedTemplates.get(norm)
        if (!tpl || tpl === l || tpl.syllabus.length !== l.syllabus.length) return
        const hasAnchor = l.syllabus[0].isDone && l.syllabus[0].time > 0
        const restUnsynced = l.syllabus.slice(1).some(s => !s.isDone || !s.duration)
        if (hasAnchor && restUnsynced) {
            const baseStart = l.syllabus[0].time
            const tplStart = tpl.syllabus[0].time
            l.syllabus.forEach((s, si) => {
                const offsetFromStart = tpl.syllabus[si].time - tplStart
                s.time = Math.max(0, baseStart + offsetFromStart)
                s.duration = tpl.syllabus[si].duration
                s.isDone = true
                if (!s.romanizedText && tpl.syllabus[si].romanizedText) {
                    s.romanizedText = tpl.syllabus[si].romanizedText
                }
            })
            if (!l.translatedText && tpl.translatedText) l.translatedText = tpl.translatedText
            _recalcLineBounds(l)
            updatedCount++
        }
    })
    if (updatedCount > 0) {
        rebuildLyricsDOM()
        _seekToFirstUnsynced()
        _markDirtyAndAutoSave()
        renderTimeline()
        if (isPreviewActive()) refreshLyricsPlusPreview()
    }
}

function fixLineGapsAndOverlaps() {
    pushHistoryState()
    tempLyrics.forEach(l => {
        if (!l || l.isTaggedLine || !l.syllabus) return
        for (let i = 0; i < l.syllabus.length - 1; i++) {
            const cur = l.syllabus[i]
            const nxt = l.syllabus[i + 1]
            if (!cur.isDone || !nxt.isDone || !cur.time || !nxt.time) continue
            if (cur.isBackground !== nxt.isBackground) continue
            const curEnd = cur.time + (cur.duration || 0)
            const gap = nxt.time - curEnd
            if (gap < 0 && nxt.time > cur.time) {
                cur.duration = Math.max(40, nxt.time - cur.time)
            } else if (gap > 0 && gap <= 65) {
                cur.duration = nxt.time - cur.time
            }
        }
        _recalcLineBounds(l)
    })
    rebuildLyricsDOM()
    _markDirtyAndAutoSave()
    renderTimeline()
    if (isPreviewActive()) refreshLyricsPlusPreview()
}

function openQualityAuditModal() {
    const existing = document.getElementById('audit-modal')
    if (existing) existing.remove()

    const issues = []
    let lyricLineNum = 0
    tempLyrics.forEach((l) => {
        if (!l || l.isTaggedLine || (l.text || '').replace(/\]/g, '').trim() === '') return
        lyricLineNum++
        const syls = l.syllabus || []
        const unsyncedCount = syls.filter(s => !s.isDone || !s.time).length
        if (unsyncedCount > 0) {
            issues.push(`Line ${lyricLineNum}: ${unsyncedCount} unsynced syllable(s)`)
        }
        syls.forEach((s) => {
            if (s.isDone && s.duration > 6000) {
                issues.push(`Line ${lyricLineNum}: "${(s.text || '').trim()}" has a very long duration (${s.duration}ms)`)
            }
            if (s.isDone && s.duration > 0 && s.duration < 35) {
                issues.push(`Line ${lyricLineNum}: "${(s.text || '').trim()}" has a very short duration (${s.duration}ms)`)
            }
        })
        const openCount = (l.text.match(/\(/g) || []).length
        const closeCount = (l.text.match(/\)/g) || []).length
        if (openCount !== closeCount) {
            issues.push(`Line ${lyricLineNum}: Unmatched parentheses in "${l.text.trim()}"`)
        }
    })

    const listHtml = issues.length === 0
        ? `<div class="settings-item-row"><span class="settings-item-title" style="color:#81c995">All ${lyricLineNum} lyric lines passed quality checks.</span></div>`
        : issues.map(msg => `<div class="settings-item-row"><span class="settings-item-title">${escapeHtmlAttr(msg)}</span></div>`).join('')

    const modal = document.createElement('div')
    modal.id = 'audit-modal'
    modal.className = 'kmake-modal'
    modal.innerHTML = `
        <div class="kmake-modal-backdrop" onclick="this.closest('.kmake-modal').remove()"></div>
        <div class="kmake-modal-content" style="max-width:520px">
            <div class="kmake-modal-header">
                <i data-lucide="shield-check" class="modal-header-icon"></i>
                <h2>Curator Quality Audit</h2>
                <button onclick="this.closest('.kmake-modal').remove()" class="modal-close-btn"><i data-lucide="x"></i></button>
            </div>
            <div class="kmake-modal-body" style="display:flex;flex-direction:column;gap:8px;max-height:60vh">
                ${listHtml}
            </div>
            <div class="kmake-modal-footer">
                <button class="btn-secondary" onclick="fixLineGapsAndOverlaps(); this.closest('.kmake-modal').remove()">Auto-Fix Micro-Gaps &amp; Overlaps</button>
                <button class="btn-primary" onclick="this.closest('.kmake-modal').remove()">Close</button>
            </div>
        </div>
    `
    document.body.appendChild(modal)
    requestAnimationFrame(() => { modal.classList.add('visible'); lucide.createIcons({ nodes: [modal] }) })
}


function openWhatsNewModal() {
    const existing = document.getElementById('whatsnew-modal')
    if (existing) existing.remove()
    try { localStorage.setItem('kmake_3_whats_new_seen', '1') } catch (e) {}

    const modal = document.createElement('div')
    modal.id = 'whatsnew-modal'
    modal.className = 'kmake-modal'
    modal.innerHTML = `
        <div class="kmake-modal-backdrop" onclick="closeWhatsNewModal()"></div>
        <div class="kmake-modal-content" style="max-width:640px">
            <div class="kmake-modal-header">
                <i data-lucide="file-text" class="modal-header-icon"></i>
                <h2>What's New in Kmake 3.0</h2>
                <button onclick="closeWhatsNewModal()" class="modal-close-btn"><i data-lucide="x"></i></button>
            </div>
            <div class="kmake-modal-body" style="display:flex;flex-direction:column;gap:12px;max-height:76vh">
                <div class="whatsnew-lead">
                    <div class="whatsnew-lead-title">Cursor-Anchored Multi-Row Timeline</div>
                    <div class="whatsnew-lead-desc">Each lyric line now sits on its own timeline track so overlapping vocals never collide. Zooming with <kbd>Ctrl+Wheel</kbd> locks directly to the timestamp under your cursor, dragging word edges resizes anchored to your pointer without scroll drift, and <kbd>Alt+Drag</kbd> proportionally stretches multi-word selections.</div>
                </div>
                <div class="whatsnew-list">
                    <div class="whatsnew-row">
                        <div class="whatsnew-row-label">Multi-Selection &amp; Batch Retime</div>
                        <div class="whatsnew-row-desc">Drag a marquee box on empty track space, press <kbd>Ctrl+A</kbd>, or click line numbers to batch-shift timings, scale durations (90% / 110%), or close micro-gaps.</div>
                    </div>
                    <div class="whatsnew-row">
                        <div class="whatsnew-row-label">60fps LyricsPlus Preview</div>
                        <div class="whatsnew-row-desc">Pure lyrics preview stage powered by <code>LyricsPlusRenderer</code> with sub-millisecond WAAPI syllable mask wipes, spring scroll physics, and a pre-blurred album artwork backdrop.</div>
                    </div>
                    <div class="whatsnew-row">
                        <div class="whatsnew-row-label">IndexedDB Crash Recovery</div>
                        <div class="whatsnew-row-desc">Projects and loaded audio files save automatically in the background so you can switch songs or resume immediately after a browser refresh.</div>
                    </div>
                    <div class="whatsnew-row">
                        <div class="whatsnew-row-label">TTML, KPoe v2 &amp; Romanization</div>
                        <div class="whatsnew-row-desc">Import and export Apple Music <code>.ttml</code>, KPoe v1/v2 JSON, LRC, eLRC, and <code>.kmake</code> archives, plus edit per-syllable romanizations and line translations.</div>
                    </div>
                    <div class="whatsnew-row">
                        <div class="whatsnew-row-label">Custom Shortcuts &amp; Rest Syntax</div>
                        <div class="whatsnew-row-desc">Rebind any keyboard shortcut, tune tap latency compensation, or enable optional empty-line, double-space, and <code>]]</code> word-end rest syllables in Settings.</div>
                    </div>
                </div>
            </div>
            <div class="kmake-modal-footer">
                <button class="btn-secondary" onclick="closeWhatsNewModal(); startInteractiveWalkthrough()">
                    <i data-lucide="compass"></i> Start Walkthrough
                </button>
                <button class="btn-primary" onclick="closeWhatsNewModal()">Close</button>
            </div>
        </div>
    `
    document.body.appendChild(modal)
    requestAnimationFrame(() => { modal.classList.add('visible'); lucide.createIcons({ nodes: [modal] }) })
}

function closeWhatsNewModal() {
    const modal = document.getElementById('whatsnew-modal')
    if (!modal) return
    modal.classList.remove('visible')
    setTimeout(() => modal.remove(), 200)
}

let _walkthroughStepIdx = 0
const _WALKTHROUGH_STEPS = [
    {
        target: '#btn-nav-home',
        title: 'Projects & Crash Recovery',
        desc: 'Your work and audio files are automatically saved to IndexedDB. Click Projects anytime to switch songs, import files, or resume a session.',
        prepare: () => { toggleHomePage(false); setCenterMode('sync') }
    },
    {
        target: '#lyrics-input',
        title: 'Lyrics & Syllable Syntax',
        desc: 'Paste plain lyrics, TTML, or LRC here. Use ] to split words into syllables, #Chorus for sections, and v1: / v2: for singers, then click Parse.',
        prepare: () => { toggleHomePage(false); setCenterMode('sync') }
    },
    {
        target: '#center-mode-steps',
        title: 'Sync, Timeline, and Preview Modes',
        desc: 'Switch seamlessly between classic keyboard Syncing, the multi-row Timeline editor, and the 60fps LyricsPlus Preview stage.',
        prepare: () => { toggleHomePage(false); setCenterMode('sync') }
    },
    {
        target: '#toolbar-timeline',
        title: 'Cursor-Anchored Timeline & Multi-Select',
        desc: 'In Timeline mode, Ctrl+Wheel zooms around your cursor, dragging empty space draws a multi-select box, and dragging word edges resizes anchored to your cursor.',
        prepare: () => { toggleHomePage(false); setCenterMode('timeline') }
    },
    {
        target: '#properties-panel',
        title: 'Batch Retiming & Romanization',
        desc: 'Select one or multiple words (or press Ctrl+A) to shift timings, stretch durations (90% / 110%), toggle background vocals, or edit syllable romanizations.',
        prepare: () => { toggleHomePage(false); setCenterMode('timeline') }
    },
    {
        target: '#btn-settings-modal',
        title: 'Settings & Custom Shortcuts',
        desc: 'Customize keyboard bindings, tap latency compensation, preview blurred artwork, and empty-line, double-space, or ]] word-end rests in Settings.',
        prepare: () => { toggleHomePage(false); setCenterMode('sync') }
    }
]

function startInteractiveWalkthrough() {
    closeWhatsNewModal()
    closeTutorial()
    closeSettingsModal()
    _walkthroughStepIdx = 0
    _renderWalkthroughStep()
}

function _renderWalkthroughStep() {
    let overlay = document.getElementById('kmake-walkthrough-overlay')
    if (!overlay) {
        overlay = document.createElement('div')
        overlay.id = 'kmake-walkthrough-overlay'
        overlay.className = 'walkthrough-overlay'
        overlay.innerHTML = `
            <div class="walkthrough-spotlight" id="walkthrough-spotlight"></div>
            <div class="walkthrough-card" id="walkthrough-card"></div>
        `
        document.body.appendChild(overlay)
    }

    const step = _WALKTHROUGH_STEPS[_walkthroughStepIdx]
    if (!step) {
        endInteractiveWalkthrough()
        return
    }
    if (step.prepare) step.prepare()

    requestAnimationFrame(() => {
        const targetEl = document.querySelector(step.target)
        const spot = document.getElementById('walkthrough-spotlight')
        const card = document.getElementById('walkthrough-card')
        if (!spot || !card) return

        const rect = targetEl ? targetEl.getBoundingClientRect() : { top: 120, left: 200, width: 300, height: 60, bottom: 180, right: 500 }
        const pad = 6
        spot.style.top = Math.max(4, rect.top - pad) + 'px'
        spot.style.left = Math.max(4, rect.left - pad) + 'px'
        spot.style.width = Math.min(window.innerWidth - 8, rect.width + pad * 2) + 'px'
        spot.style.height = Math.min(window.innerHeight - 8, rect.height + pad * 2) + 'px'

        const isLast = _walkthroughStepIdx === _WALKTHROUGH_STEPS.length - 1
        card.innerHTML = `
            <div class="walkthrough-step-meta">
                <span>Kmake 3.0 Tour · Step ${_walkthroughStepIdx + 1} of ${_WALKTHROUGH_STEPS.length}</span>
                <button onclick="endInteractiveWalkthrough()" style="background:none;border:none;color:var(--md-sys-color-on-surface-variant);cursor:pointer;font-size:0.75rem">Skip</button>
            </div>
            <div class="walkthrough-title">${step.title}</div>
            <div class="walkthrough-desc">${step.desc}</div>
            <div class="walkthrough-actions">
                <button class="btn-secondary" onclick="prevWalkthroughStep()" ${_walkthroughStepIdx === 0 ? 'disabled style="opacity:0.4;pointer-events:none"' : ''}>Back</button>
                <button class="btn-primary" onclick="${isLast ? 'endInteractiveWalkthrough()' : 'nextWalkthroughStep()'}">${isLast ? 'Finish' : 'Next'}</button>
            </div>
        `

        const cardW = 340
        const cardH = 175
        let cardTop = rect.bottom + 14
        if (cardTop + cardH > window.innerHeight - 16) {
            cardTop = Math.max(16, rect.top - cardH - 14)
        }
        let cardLeft = Math.min(window.innerWidth - cardW - 16, Math.max(16, rect.left))
        card.style.top = cardTop + 'px'
        card.style.left = cardLeft + 'px'
    })
}

function nextWalkthroughStep() {
    if (_walkthroughStepIdx < _WALKTHROUGH_STEPS.length - 1) {
        _walkthroughStepIdx++
        _renderWalkthroughStep()
    } else {
        endInteractiveWalkthrough()
    }
}

function prevWalkthroughStep() {
    if (_walkthroughStepIdx > 0) {
        _walkthroughStepIdx--
        _renderWalkthroughStep()
    }
}

function endInteractiveWalkthrough() {
    document.getElementById('kmake-walkthrough-overlay')?.remove()
}

_refreshShortcutLabelsUI()
_updatePreviewSongCard()
toggleHomePage(true)
;(function _checkFirstRun30() {
    let seen = null
    try { seen = localStorage.getItem('kmake_3_whats_new_seen') } catch (err) {}
    if (!seen) {
        setTimeout(() => openWhatsNewModal(), 250)
    }
})()

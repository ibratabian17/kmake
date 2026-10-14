function parseSyncedLyrics(lrcContent) {
  const timeTagRegex = /\[(\d+):(\d{2})(?:[.:](\d+))?\]/g;
  const wordTagRegex = /<(\d+):(\d{2})(?:[.:](\d+))?>/g;
  const metadataRegex = /^\[([a-zA-Z#]+):([^\]]*)\]$/;
  const offsetRegex = /^\[offset:(-?\d+)\]$/i;
  const speakerRegex = /\[(bg|v1|v2|v3|F|M|D|duet|male|female)(?::)?\]/i;

  let offset = 0;
  const lines = lrcContent.split(/\r?\n/);

  lines.forEach(line => {
    const match = line.trim().match(offsetRegex);
    if (match) {
      // Standard LRC [offset:200] shifts timestamps 200ms earlier, so negate.
      offset = parseInt(match[1], 10) * -1;
    }
  });

  const parseTime = (minutes, seconds, msStr) => {
    const min = parseInt(minutes, 10);
    const sec = parseInt(seconds, 10);
    let ms = 0;
    if (msStr) {
      if (msStr.length === 2) ms = parseInt(msStr, 10) * 10;
      else if (msStr.length === 1) ms = parseInt(msStr, 10) * 100;
      else ms = parseInt(msStr.substring(0, 3), 10);
    }
    const total = (min * 60 * 1000) + (sec * 1000) + ms + offset;
    return total < 0 ? 0 : total;
  };

  const parseTimeFromMatch = (match) => parseTime(match[1], match[2], match[3]);

  const rawEntries = [];
  let isEnhanced = false;

  lines.forEach(line => {
    line = line.trim();
    if (!line) return;

    if (metadataRegex.test(line) && !timeTagRegex.test(line)) {
      return;
    }

    let currentSpeaker = "";
    const speakerMatch = line.match(speakerRegex);
    if (speakerMatch) {
      currentSpeaker = speakerMatch[1].toLowerCase();
      line = line.replace(speakerRegex, '');
    }

    // Support compressed LRC with multiple [mm:ss] tags on one line.
    const timeMatches = [...line.matchAll(timeTagRegex)];
    if (timeMatches.length === 0) return;

    let content = line.replace(timeTagRegex, '').trim();

    const wordMatches = [...content.matchAll(wordTagRegex)];
    const hasWordTags = wordMatches.length > 0;
    if (hasWordTags) isEnhanced = true;

    let syllabus = [];
    if (hasWordTags) {
      let lastIndex = 0;
      wordMatches.forEach(wm => {
        const wordTime = parseTimeFromMatch(wm);
        const preText = content.substring(lastIndex, wm.index);
        if (preText) {
          // Text before the first word tag attaches to the line start.
          syllabus.push({ text: preText, time: 0, duration: 0, isTag: false });
        }
        syllabus.push({ text: "", time: wordTime, duration: 0, isTag: true });
        lastIndex = wm.index + wm[0].length;
      });
      const tailText = content.substring(lastIndex);
      if (tailText) {
        syllabus.push({ text: tailText, time: 0, duration: 0, isTag: false });
      }

      const refinedSyllabus = [];
      let currentWordTime = 0;

      syllabus.forEach(item => {
        if (item.isTag) {
          currentWordTime = item.time;
        } else {
          refinedSyllabus.push({
            text: item.text,
            time: currentWordTime,
            duration: 0
          });
        }
      });

      syllabus = refinedSyllabus;
      content = content.replace(wordTagRegex, '');
    }

    timeMatches.forEach(tm => {
      const lineTime = parseTimeFromMatch(tm);

      const lineSyllabus = syllabus.map(s => ({ ...s }));
      if (lineSyllabus.length > 0 && lineSyllabus[0].time === 0) {
        lineSyllabus[0].time = lineTime;
      }

      for (let i = 0; i < lineSyllabus.length - 1; i++) {
        if (lineSyllabus[i + 1].time > lineSyllabus[i].time) {
          lineSyllabus[i].duration = lineSyllabus[i + 1].time - lineSyllabus[i].time;
        }
      }

      rawEntries.push({
        time: lineTime,
        text: content,
        syllabus: lineSyllabus,
        speaker: currentSpeaker
      });
    });
  });

  rawEntries.sort((a, b) => a.time - b.time);

  const validLyrics = rawEntries.map((entry, index) => {
    const nextEntry = rawEntries[index + 1];
    let duration = 0;

    if (nextEntry) {
      duration = nextEntry.time - entry.time;
    } else {
      duration = 5000;
    }

    if (entry.syllabus.length > 0) {
      const lastSyl = entry.syllabus[entry.syllabus.length - 1];
      if (lastSyl.duration === 0) {
        const estimatedEnd = entry.time + duration;
        lastSyl.duration = Math.max(0, estimatedEnd - lastSyl.time);
      }
    }

    if (isEnhanced && entry.syllabus.length === 0 && entry.text) {
      entry.syllabus.push({
        text: entry.text,
        time: entry.time,
        duration: duration
      });
    }

    return {
      time: entry.time,
      duration: duration,
      text: entry.text,
      syllabus: entry.syllabus,
      element: {
        key: "",
        songPart: "",
        singer: entry.speaker
      }
    };
  }).filter(l => l.text.trim() !== '');

  return {
    KpoeTools: '1.1-parseSyncedLyrics-LRC',
    type: isEnhanced ? 'Word' : 'Line',
    metadata: {
      source: "Local Files",
      songWriters: [],
      title: '',
      language: '',
      agents: {},
      totalDuration: ''
    },
    lyrics: validLyrics,
    cached: 'None'
  };
}

function parseAppleTTML(ttml, offset = 0, separate = false) {
  const KPOE = '1.7-1-ConvertTTMLtoJSON-DOMParser';

  const timeToMs = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    let totalMs = 0;
    if (parts.length === 3) {
      const [h, m, s] = parts.map(p => parseFloat(p) || 0);
      totalMs = (h * 3600 + m * 60 + s) * 1000;
    } else if (parts.length === 2) {
      const [m, s] = parts.map(p => parseFloat(p) || 0);
      totalMs = (m * 60 + s) * 1000;
    } else {
      totalMs = parseFloat(parts[0]) * 1000;
    }
    return isNaN(totalMs) ? 0 : Math.round(totalMs);
  };

  const decodeHtmlEntities = (text) => {
    if (!text) return '';
    const map = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };
    return text.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (m) => map[m] || m);
  };

  function getAttr(el, ...attrNames) {
    if (!el || !el.getAttribute) return null;

    for (const name of attrNames) {
      if (!name) continue;
      try {
        const val = el.getAttribute(name);
        if (val !== null && val !== undefined) return val;
      } catch (e) {}
    }

    if (el.attributes && el.attributes.length > 0) {
      const targetLocals = attrNames.map(n => n.toLowerCase().split(':').pop());
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        if (!attr) continue;
        const attrName = attr.name || '';
        const attrLocal = (attr.localName || attrName.split(':').pop() || '').toLowerCase();
        const attrFull = attrName.toLowerCase();
        for (const target of targetLocals) {
          if (attrLocal === target || attrFull === target) {
            return attr.value;
          }
        }
      }
    }

    for (const name of attrNames) {
      if (!name) continue;
      const local = name.split(':').pop();
      try {
        if (el.getAttributeNS) {
          const val = el.getAttributeNS(null, local);
          if (val !== null && val !== undefined) return val;
        }
      } catch (e) {}
    }

    return null;
  }

  function getElementsByLocalName(node, ...targetNames) {
    if (!node) return [];
    const results = [];
    const targets = targetNames.map(t => t.toLowerCase());

    function walk(current) {
      if (!current) return;
      if (current.nodeType === 1) {
        const local = (current.localName || current.nodeName.split(':').pop() || '').toLowerCase();
        if (targets.includes(local)) {
          results.push(current);
        }
      }
      const children = current.childNodes;
      if (children) {
        for (let i = 0; i < children.length; i++) {
          walk(children[i]);
        }
      }
    }

    const children = node.childNodes;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        walk(children[i]);
      }
    }

    return results;
  }

  function getFirstElementByLocalName(node, ...targetNames) {
    if (!node) return null;
    const targets = targetNames.map(t => t.toLowerCase());

    function walk(current) {
      if (!current) return null;
      if (current.nodeType === 1) {
        const local = (current.localName || current.nodeName.split(':').pop() || '').toLowerCase();
        if (targets.includes(local)) {
          return current;
        }
      }
      const children = current.childNodes;
      if (children) {
        for (let i = 0; i < children.length; i++) {
          const found = walk(children[i]);
          if (found) return found;
        }
      }
      return null;
    }

    const children = node.childNodes;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        const found = walk(children[i]);
        if (found) return found;
      }
    }

    return null;
  }

  function collectTailText(node) {
    let txt = '';
    let sib = node.nextSibling;
    while (sib && sib.nodeType === 3) { 
      txt += sib.nodeValue || '';
      sib = sib.nextSibling;
    }
    return txt;
  }

  function isInsideBackgroundWrapper(node, paragraph) {
    let current = node.parentNode;
    while (current && current !== paragraph) {
      const roleVal = getAttr(current, 'role', 'ttm:role');
      if (roleVal === 'x-bg') return true;
      current = current.parentNode;
    }
    return false;
  }

  const parser = new DOMParser();
  const cleanXml = String(ttml || '').replace(/^\uFEFF/, '').trim();
  let doc = parser.parseFromString(cleanXml, 'application/xml');

  if (doc.getElementsByTagName && doc.getElementsByTagName('parsererror').length > 0) {
    const repairedXml = cleanXml.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
    doc = parser.parseFromString(repairedXml, 'application/xml');
    if (doc.getElementsByTagName && doc.getElementsByTagName('parsererror').length > 0) {
      console.error('Failed to parse TTML document.');
      return null;
    }
  }

  const root = doc.documentElement;
  if (!root) return null;

  const rawTiming = getAttr(root, 'timing', 'itunes:timing');
  const timingMode = rawTiming || 'Word';

  const bodyEl = getFirstElementByLocalName(doc, 'body');
  const metadata = {
    source: 'Apple Music', 
    songWriters: [], 
    title: '',
    language: getAttr(root, 'lang', 'xml:lang') || '',
    agents: {},
    songParts: [],
    totalDuration: getAttr(bodyEl, 'dur') || '',
  };

  const headEl = getFirstElementByLocalName(doc, 'head');
  const itunesMetaEl = headEl 
    ? (getFirstElementByLocalName(headEl, 'iTunesMetadata', 'metadata')) 
    : (getFirstElementByLocalName(doc, 'iTunesMetadata', 'metadata'));

  if (headEl) {
    const agentNodes = getElementsByLocalName(headEl, 'agent');
    for (let i = 0; i < agentNodes.length; i++) {
      const a = agentNodes[i];
      const agentId = getAttr(a, 'id', 'xml:id');
      if (!agentId) continue;
      const type = getAttr(a, 'type') || 'person';
      let name = '';
      const nameNode = getFirstElementByLocalName(a, 'name');
      if (nameNode) name = decodeHtmlEntities(nameNode.textContent.trim());
      metadata.agents[agentId] = { type, name, alias: agentId.replace('voice', 'v') };
    }

    const metaContent = itunesMetaEl || getFirstElementByLocalName(headEl, 'metadata');
    if (metaContent) {
      const titleEl = getFirstElementByLocalName(metaContent, 'title');
      if (titleEl) metadata.title = decodeHtmlEntities(titleEl.textContent.trim());

      const songwritersEl = getFirstElementByLocalName(metaContent, 'songwriters');
      if (songwritersEl) {
        const songwriterNodes = getElementsByLocalName(songwritersEl, 'songwriter');
        for (let i = 0; i < songwriterNodes.length; i++) {
          const name = decodeHtmlEntities(songwriterNodes[i].textContent.trim());
          if (name) metadata.songWriters.push(name);
        }
      }

      const curatorEl = getFirstElementByLocalName(metaContent, 'curator');
      if (curatorEl) metadata.curator = decodeHtmlEntities(curatorEl.textContent.trim());
    }
  }

  const translationMap = {};
  const transliterationMap = {};

  if (itunesMetaEl) {
    const translationsNode = getFirstElementByLocalName(itunesMetaEl, 'translations');
    if (translationsNode) {
      const translationNodes = getElementsByLocalName(translationsNode, 'translation');
      for (const transNode of translationNodes) {
        const lang = getAttr(transNode, 'lang', 'xml:lang');
        const textNodes = getElementsByLocalName(transNode, 'text');
        for (const textNode of textNodes) {
          const lineId = getAttr(textNode, 'for');
          if (lineId) {
            translationMap[lineId] = {
              lang: lang,
              text: decodeHtmlEntities(textNode.textContent.trim())
            };
          }
        }
      }
    }

    const transliterationsNode = getFirstElementByLocalName(itunesMetaEl, 'transliterations');
    if (transliterationsNode) {
      const transliterationNodes = getElementsByLocalName(transliterationsNode, 'transliteration');
      for (const translitNode of transliterationNodes) {
        const lang = getAttr(translitNode, 'lang', 'xml:lang');
        const textNodes = getElementsByLocalName(translitNode, 'text');

        for (const textNode of textNodes) {
          const lineId = getAttr(textNode, 'for');
          if (!lineId) continue;

          const spans = getElementsByLocalName(textNode, 'span').filter(
            span => getAttr(span, 'begin')
          );

          if (spans.length > 0) {
            const syllabus = [];
            let fullText = '';
            const processedSpans = new Set();

            for (const span of spans) {
              if (processedSpans.has(span)) continue;
              processedSpans.add(span);

              let spanText = '';
              for (const child of span.childNodes) {
                if (child.nodeType === 3) spanText += child.nodeValue || '';
              }
              spanText = decodeHtmlEntities(spanText);

              const tail = collectTailText(span);
              if (tail && !separate) spanText += decodeHtmlEntities(tail);
              
              if (spanText.trim() === '') continue;

              const begin = getAttr(span, 'begin');
              const end = getAttr(span, 'end');

              syllabus.push({
                time: timeToMs(begin) + offset,
                duration: timeToMs(end) - timeToMs(begin),
                text: spanText,
              });
              fullText += spanText;
            }
            transliterationMap[lineId] = { lang, text: fullText.trim(), syllabus };
          } else {
            transliterationMap[lineId] = {
              lang: lang,
              text: decodeHtmlEntities(textNode.textContent.trim())
            };
          }
        }
      }
    }
  }

  const lyrics = [];
  const divs = getElementsByLocalName(doc, 'div');
  const divContainers = divs.length > 0 ? divs : (bodyEl ? [bodyEl] : [doc.documentElement]);

  for (let i = 0; i < divContainers.length; i++) {
    const div = divContainers[i];
    const songPart = getAttr(div, 'song-part', 'songPart', 'itunes:song-part', 'itunes:songPart') || '';
    const ps = getElementsByLocalName(div, 'p');
    
    let divBegin = getAttr(div, 'begin');
    let divEnd = getAttr(div, 'end');
    
    // Fall back to <p> timings when <div> containers omit begin/end.
    if ((!divBegin || !divEnd) && ps.length > 0) {
        if (!divBegin) divBegin = getAttr(ps[0], 'begin');
        if (!divEnd) divEnd = getAttr(ps[ps.length - 1], 'end');
    }
    
    const partTime = timeToMs(divBegin) + (divBegin ? offset : 0);
    const partDur = Math.max(0, timeToMs(divEnd) - timeToMs(divBegin));

    metadata.songParts.push({
        name: songPart,
        time: partTime !== 0 ? partTime : undefined,
        duration: partDur !== 0 ? partDur : undefined,
    });

    for (let j = 0; j < ps.length; j++) {
      const p = ps[j];
      const key = getAttr(p, 'key', 'itunes:key') || '';
      const singerId = getAttr(p, 'agent', 'ttm:agent', 'singer') || '';
      const singer = singerId.replace('voice', 'v');
      
      const pBegin = getAttr(p, 'begin');
      const pEnd = getAttr(p, 'end');

      const currentLine = {
        time: 0,
        duration: 0,
        text: '',
        syllabus: [],
        element: { key, singer, songPartIndex: i }
      };

      if (pBegin && pEnd) {
          currentLine.time = timeToMs(pBegin) + offset;
          currentLine.duration = timeToMs(pEnd) - timeToMs(pBegin);
      }

      if (timingMode === 'Word') {
        const allSpansInP = getElementsByLocalName(p, 'span').filter(span => getAttr(span, 'begin'));
        
        if (allSpansInP.length > 0) {
            const processedSpans = new Set();
            for (const sp of allSpansInP) {
              if (processedSpans.has(sp)) continue;

              const isBg = isInsideBackgroundWrapper(sp, p);
              if (isBg) {
                getElementsByLocalName(sp, 'span').forEach(nested => processedSpans.add(nested));
              }
              processedSpans.add(sp);

              const begin = getAttr(sp, 'begin') || '0';
              const end = getAttr(sp, 'end') || '0';

              let spanText = '';
              for (const child of sp.childNodes) {
                if (child.nodeType === 3) spanText += child.nodeValue || '';
              }
              spanText = decodeHtmlEntities(spanText);

              const tail = collectTailText(sp);
              if (tail && !separate) spanText += decodeHtmlEntities(tail);

              if (spanText.trim() === '' && (!tail || !tail.includes(' '))) continue;

              const syllabusEntry = {
                time: timeToMs(begin) + offset,
                duration: timeToMs(end) - timeToMs(begin),
                text: spanText
              };
              if (isBg) syllabusEntry.isBackground = true;

              currentLine.syllabus.push(syllabusEntry);
              currentLine.text += spanText;
            }
        } else {
            // Treat Word-mode <p> with no child <span> tags as line-synced.
            currentLine.text = decodeHtmlEntities(p.textContent.trim());
        }
      } else {
        let lineText = '';
        const extractText = (node) => {
            let t = '';
            for (const child of node.childNodes) {
                if (child.nodeType === 3) t += child.nodeValue || '';
                else if (child.nodeType === 1) t += extractText(child);
            }
            return t;
        };
        lineText = extractText(p);
        currentLine.text = decodeHtmlEntities(lineText.trim());
        
        if (timingMode === 'None' || (!pBegin && !pEnd)) {
            currentLine.time = undefined;
            currentLine.duration = undefined;
        }
      }

      if (currentLine.text || currentLine.syllabus.length > 0) {
        if (key && translationMap[key]) currentLine.translation = translationMap[key];
        if (key && transliterationMap[key]) currentLine.transliteration = transliterationMap[key];
        lyrics.push(currentLine);
      }
    }
  }

  let detectedType = timingMode;
  if (!rawTiming) {
    if (lyrics.some(l => l.syllabus && l.syllabus.length > 0)) {
      detectedType = 'Word';
    } else if (lyrics.some(l => l.time != null && !isNaN(l.time))) {
      detectedType = 'Line';
    } else {
      detectedType = 'None';
    }
  }

  return {
    KpoeTools: KPOE,
    type: detectedType,
    metadata,
    lyrics,
  };
}

function normalizeV2(data) {
  if (data.lyrics?.length > 0 && data.lyrics.every(l => l.element?.songPartIndex != null)) {
    return data;
  }

  const songParts = [];
  let currentPartName = null;
  let currentPartIndex = -1;

  const normalizedLyrics = data.lyrics.map(line => {
    const partName = line.element?.songPart || '';

    if (partName !== currentPartName) {
      currentPartName = partName;
      currentPartIndex++;
      songParts.push({ name: partName });
    }

    const { songPart, ...restElement } = line.element || {};
    return {
      ...line,
      element: { ...restElement, songPartIndex: currentPartIndex }
    };
  });

  // Derive songPart time and duration from its member lines.
  normalizedLyrics.forEach(line => {
    const idx = line.element.songPartIndex;
    const part = songParts[idx];
    const endTime = line.time + line.duration;

    if (part.time == null || line.time < part.time) part.time = line.time;
    if (part._end == null || endTime > part._end) part._end = endTime;
  });

  songParts.forEach(part => {
    if (part.time != null && part._end != null) part.duration = part._end - part.time;
    delete part._end;
  });

  return {
    ...data,
    metadata: { ...data.metadata, songParts },
    lyrics: normalizedLyrics,
  };
}

function v1Tov2(data) {
  const groupedLyrics = [];
  let currentGroup = null;

  if (data.type === "Line") {
    data.lyrics.forEach(segment => {
      groupedLyrics.push({
        time: segment.time,
        duration: segment.duration,
        text: segment.text,
        syllabus: [],
        element: segment.element || { key: "", songPart: "", singer: "" }
      });
    });
  } else {
    data.lyrics.forEach(segment => {
      if (!currentGroup) {
        currentGroup = {
          time: segment.time,
          duration: 0,
          text: "",
          syllabus: [],
          element: segment.element || { key: "", songPart: "", singer: "" }
        };
      }

      currentGroup.text += segment.text;

      const syllabusEntry = {
        time: segment.time,
        duration: segment.duration,
        text: segment.text
      };

      if (segment.element?.isBackground === true) {
        syllabusEntry.isBackground = true;
      }

      currentGroup.syllabus.push(syllabusEntry);

      if (segment.isLineEnding === 1) {
        let earliestTime = Infinity;
        let latestEndTime = 0;
        currentGroup.syllabus.forEach(syl => {
          if (syl.time < earliestTime) earliestTime = syl.time;
          const end = syl.time + syl.duration;
          if (end > latestEndTime) latestEndTime = end;
        });
        currentGroup.time = earliestTime;
        currentGroup.duration = latestEndTime - earliestTime;
        currentGroup.text = currentGroup.text.trim();
        groupedLyrics.push(currentGroup);
        currentGroup = null;
      }
    });

    if (currentGroup) {
      let earliestTime = Infinity;
      let latestEndTime = 0;
      currentGroup.syllabus.forEach(syl => {
        if (syl.time < earliestTime) earliestTime = syl.time;
        const end = syl.time + syl.duration;
        if (end > latestEndTime) latestEndTime = end;
      });
      currentGroup.time = earliestTime;
      currentGroup.duration = latestEndTime - earliestTime;
      currentGroup.text = currentGroup.text.trim();
      groupedLyrics.push(currentGroup);
    }
  }

  // Convert element.songPart to songPartIndex and build metadata.songParts.
  return normalizeV2({
    type: data.type == "syllable" ? "Word" : data.type,
    KpoeTools: '2.0-LPlusBcknd,' + data.KpoeTools,
    metadata: data.metadata,
    ignoreSponsorblock: data.ignoreSponsorblock || undefined,
    lyrics: groupedLyrics,
    cached: data.cached || 'None'
  });
}

function convertToStandardJson(parsedLyrics) {
  return parsedLyrics;
}

if (typeof exports !== 'undefined') {
  module.exports = { parseSyncedLyrics, parseAppleTTML, convertToStandardJson, v1Tov2 };
} 

if (typeof window !== 'undefined') {
  if (typeof window.lyricspluslib == 'undefined') window.lyricspluslib = {};
  window.lyricspluslib.parseSyncedLyrics = parseSyncedLyrics;
  window.lyricspluslib.parseAppleTTML = parseAppleTTML;
  window.lyricspluslib.v1Tov2 = v1Tov2;
  window.lyricspluslib.convertToStandardJson = convertToStandardJson;
}


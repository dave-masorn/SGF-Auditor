/**
 * kifu-translate.js
 *
 * Web-ready (browser + Node 18+) ES module port of the Japanese/Chinese/Korean ->
 * English translation logic originally embedded in download-kifudepot.sh
 * (player/rank tables merged with the foxwq downloader's lookups).
 *
 * - Local lookup tables for known Go players (JP/CN/KR), dan ranks (incl. Hangul),
 *   and Go terms/titles (pro, amateur, Honinbo, joseki, ...).
 * - Google Translate gtx endpoint (CORS-enabled) as the fallback for everything
 *   else, with an in-memory cache seeded from the existing .trans_cache.json.
 * - Title-case + filename helpers mirroring the shell script's English mode.
 *
 * Web use cases:
 *   1. "Translate to English" on an SGF editor:
 *        import { translateSgf } from './kifu-translate.js';
 *        const eng = await translateSgf(sgfText, { delayMs: 0 });
 *        // replaces EV/GN/PB/PW/BR/WR/PC/SO/US/ON/AN/CP + all C comments
 *   2. English filename at download time:
 *        import { englishFilenameFromSgf } from './kifu-translate.js';
 *        const name = await englishFilenameFromSgf(sgfText);
 *        // "1973-09-19__2nd-Round-of-the-12th-Judansen-...__Go-Seigen__(W+2.5).sgf"
 *
 * Low-level helpers:
 *   translate(), translateRank(), resolvePlayer(), titleCase(),
 *   englishFilename(), rootProps(), isEnglish()
 */

/* Known Western names for well-known players (overrides Google translation). */
export const PLAYER_LOOKUP = {
    // Go Seigen's opponents and peers
    '呉清源': 'Go Seigen',
    '半田道玄': 'Handa Dogen',
    '加藤正夫': 'Kato Masao',
    '大平修三': 'Ohira Shuzo',
    '藤沢朋斎': 'Fujisawa Hosai',
    '藤沢秀行': 'Fujisawa Hideyuki',
    '高川格': 'Takagawa Kaku',
    '橋本昌二': 'Hashimoto Shoji',
    '橋本宇太郎': 'Hashimoto Utaro',
    '木谷實': 'Kitani Minoru',
    '木谷実': 'Kitani Minoru',
    '坂田栄男': 'Sakata Eio',
    '林海峰': 'Rin Kaiho',
    '大竹英雄': 'Otake Hideo',
    '梶原武雄': 'Kajiwara Takeo',
    '宮下秀洋': 'Miyashita Shuyo',
    '宮本直毅': 'Miyamoto Naoki',
    '山部俊郎': 'Yamabe Toshiro',
    '曲励起': 'Magari Riki',
    '杉内雅男': 'Sugiuchi Masao',
    '林有太郎': 'Hayashi Yutaro',
    '中村勇太郎': 'Nakamura Yutaro',
    '岩田達明': 'Iwata Tatsuaki',
    '島村俊廣': 'Shimamura Toshihiro',
    '関山利夫': 'Sekiyama Toshio',
    '工藤紀夫': 'Kudo Norio',
    '窪内秀知': 'Kubouchi Shuchi',
    '榊原章二': 'Sakakibara Shoji',
    '鈴木越雄': 'Suzuki Goro',
    '藤沢庫之助': 'Fujisawa Kuranosuke',
    '高橋重行': 'Takahashi Shigeyuki',
    '岩本薫': 'Iwamoto Kaoru',
    '瀬越憲作': 'Segoe Kensaku',
    '鈴木為次郎': 'Suzuki Hidejiro',
    // Modern Japanese
    '井山裕太': 'Iyama Yuta',
    '芝野虎丸': 'Shibano Tomoya',
    '一力遼': 'Ichiriki Ryo',
    '許家元': 'Cho Kaiken',
    '余正麒': 'Yo Shoki',
    '張栩': 'Cho U',
    '山下敬吾': 'Yamashita Keigo',
    '高尾紳路': 'Takao Shinji',
    '依田紀基': 'Yoda Norimoto',
    '趙治勲': 'Cho Chikun',
    '小林光一': 'Kobayashi Koichi',
    '武宮正樹': 'Takemiya Masaki',
    '王立誠': 'O Rissei',
    '小松英樹': 'Komatsu Hideki',
    '柳時熏': 'Ryu Shikun',
    '趙善津': 'Cho Sonjin',
    '山城宏': 'Yamashiro Hiroshi',
    '石田芳夫': 'Ishida Yoshio',
    '淡路修三': 'Awaji Shuzo',
    '小林覚': 'Kobayashi Satoru',
    '片岡聡': 'Kataoka Satoshi',
    '羽根泰正': 'Hane Yasumasa',
    '羽根直樹': 'Hane Naoki',
    '結城聡': 'Yuki Satoshi',
    '今村俊也': 'Imamura Toshiya',
    '三村智保': 'Mimura Tomoyasu',
    '彦坂直人': 'Hikosaka Naoto',
    '本田邦久': 'Honda Kunihisa',
    '小県真樹': 'Ogata Masaki',
    '石井邦生': 'Ishii Kunio',
    // Historical
    '本因坊秀策': 'Honinbo Shusaku',
    '本因坊秀栄': 'Honinbo Shuei',
    '本因坊秀哉': 'Honinbo Shusai',
    '本因坊秀甫': 'Honinbo Shuho',
    '本因坊道策': 'Honinbo Dosaku',
    '本因坊丈和': 'Honinbo Jowa',
    '本因坊秀和': 'Honinbo Shuwa',
    '安井算哲': 'Yasui Santetsu',
    // Korean
    '李世乭': 'Lee Sedol',
    '李昌鎬': 'Lee Changho',
    '曹薰鉉': 'Cho Hunhyun',
    '劉昌赫': 'Yoo Changhyuk',
    '朴永訓': 'Park Yeonghun',
    '朴廷桓': 'Park Junghwan',
    '申真谞': 'Shin Jinseo',
    '申旻埈': 'Shin Minjun',
    '崔哲瀚': 'Choi Cheolhan',
    '金志錫': 'Kim Jiseok',
    '姜東潤': 'Kang Dongyun',
    '元晟溱': 'Won Seongjin',
    '卞相壹': 'Byun Sangil',
    // Chinese
    '柯洁': 'Ke Jie',
    '古力': 'Gu Li',
    '常昊': 'Chang Hao',
    '孔杰': 'Kong Jie',
    '李世石': 'Lee Sedol',
    '陈耀烨': 'Chen Yaoye',
    '时越': 'Shi Yue',
    '江维杰': 'Jiang Weijie',
    '周睿羊': 'Zhou Ruiyang',
    '柁嘉熹': 'Tuo Jiaxi',
    '芈昱廷': 'Mi Yuting',
    '唐韦星': 'Tang Weixing',
    '范廷钰': 'Fan Tingyu',
    '杨鼎新': 'Yang Dingxin',
    '谢尔豪': 'Xie Erhao',
    '连笑': 'Lian Xiao',
    '辜梓豪': 'Gu Zihao',
    '党毅飞': 'Dang Yifei',
    '丁浩': 'Ding Hao',
    '李轩豪': 'Li Xuanhao',
    '王星昊': 'Wang Xinghao',
    '李钦诚': 'Li Qincheng',
    '廖元赫': 'Liao Yuanhe',
    '赵晨宇': 'Zhao Chenyu',
    '许嘉阳': 'Xu Jiayang',
    '李维清': 'Li Weiqing',
    '檀啸': 'Tan Xiao',
    // Korean (Hangul) — merged from the foxwq downloader
    '신진서': 'Shin Jinseo',
    '박정환': 'Park Junghwan',
    '이세돌': 'Lee Sedol',
    '최철한': 'Choi Cheolhan',
    '변상일': 'Byun Sangil',
    '김명원': 'Kim Mingwon',
    '강동윤': 'Kang Dongyun',
    '이동훈': 'Lee Donghoon',
    '원성진': 'Won Seongjin',
    '한승주': 'Han Seungju',
    '홍성지': 'Hong Seongji',
    '윤찬희': 'Yoon Chanhee',
    '김승재': 'Kim Seungjae',
    '신민준': 'Shin Minjun',
    '국제현': 'Kuk Jeehyun',
    '안정기': 'An Jeongki',
    '설현준': 'Seol Hyunjun',
    '김은지': 'Kim Eunji',
    '최정': 'Choi Jeong',
    '노승현': 'Noh Seunghyun',
    '백성혁': 'Baek Seonghyeok',
    // Simplified/alternate spellings — merged from the foxwq downloader
    '姜东润': 'Kang Dongyun',
    '李东勋': 'Lee Donghoon',
    '韩升周': 'Han Seungju',
    '洪性志': 'Hong Seongji',
    '尹灿熙': 'Yoon Chanhee',
    '金承在': 'Kim Seungjae',
    '金恩持': 'Kim Eunji',
    '崔精': 'Choi Jeong',
    '金明煜': 'Kim Mingwon',
    '谢科': 'Xie Ke',
    '屠晓宇': 'Tu Xiaoyu',
    '张学斌': 'Zhang Xuebin',
    '高尾绅路': 'Takao Shinji',
    '依田纪基': 'Yoda Norimoto',
    '赵治勋': 'Cho Chikun',
    '王立诚': 'O Rissei',
    '武宫正树': 'Takemiya Masaki',
    '一力辽': 'Ichiriki Ryo',
    '许家元': 'Cho Kaiken',
    '关航太郎': 'Seki Kotaro',
};

export const RANK_MAP = {
    '初段': '1-dan', '二段': '2-dan', '三段': '3-dan', '四段': '4-dan',
    '五段': '5-dan', '六段': '6-dan', '七段': '7-dan', '八段': '8-dan',
    '九段': '9-dan', '十段': '10-dan',
    'アマ': 'amateur', 'アマチュア': 'amateur',
    'プロ': 'Pro', 'プロ棋士': 'Pro', '棋士': 'Pro',
    '职业': 'Pro', '職業': 'Pro', '职业棋手': 'Pro', '職業棋士': 'Pro',
    '业余': 'amateur', '業餘': 'amateur', '业余棋手': 'amateur',
    '아마': 'amateur', '아마추어': 'amateur', '프로': 'Pro',
    '초단': '1-dan', '이단': '2-dan', '삼단': '3-dan', '사단': '4-dan',
    '오단': '5-dan', '육단': '6-dan', '칠단': '7-dan', '팔단': '8-dan', '구단': '9-dan',
};

/* Go-specific terms resolved locally (exact match, never a substring), in JP/CN/KR. */
export const GO_TERMS = {
    // the game itself
    '囲碁': 'Go', '围棋': 'Go', '圍棋': 'Go', '바둑': 'Go',
    // professional / amateur status (also in RANK_MAP)
    'プロ': 'Pro', 'プロ棋士': 'Pro', '棋士': 'Pro',
    '职业': 'Pro', '職業': 'Pro', '职业棋手': 'Pro', '職業棋士': 'Pro',
    '业余': 'amateur', '業餘': 'amateur', '业余棋手': 'amateur',
    'アマ': 'amateur', 'アマチュア': 'amateur', '아마추어': 'amateur', '프로': 'Pro',
    '초단': '1-dan', '이단': '2-dan', '삼단': '3-dan', '사단': '4-dan',
    '오단': '5-dan', '육단': '6-dan', '칠단': '7-dan', '팔단': '8-dan', '구단': '9-dan',
    // titles
    '本因坊': 'Honinbo', '名人': 'Meijin',
    '棋聖': 'Kisei', '棋圣': 'Kisei',
    '王座': 'Oza', '天元': 'Tengen',
    '碁聖': 'Gosei', '碁圣': 'Gosei',
    '棋王': 'Kio', '竜王': 'Ryuo', '龙王': 'Ryuo', '王位': 'Oi',
    // game phases
    '序盤': 'opening', '序盘': 'opening',
    '中盤': 'middle game', '中盘': 'middle game',
    '終盤': 'endgame', '终盘': 'endgame', '官子': 'endgame',
    // techniques / concepts
    '定式': 'joseki', '定石': 'joseki', '手筋': 'tesuji', '死活': 'life and death',
    '复盘': 'review', '検討': 'review', '检讨': 'review', '복기': 'review',
    // game types
    '対局': 'game', '对局': 'game', '互先': 'even game',
    '置碁': 'handicap game', '置棋': 'handicap game',
    '目': 'point',
};

/* Lowecase-first words for Title Case, mirroring the shell script. */
export const LOWER_WORDS = new Set([
    'a', 'an', 'the',
    'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
    'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'with',
    'from', 'into', 'onto', 'over', 'under', 'about', 'around', 'against', 'between',
]);

const CACHE_KEY = 'kifu.translate.cache.v1';

/* Seed cache from .trans_cache.json so known phrases resolve offline. */
const SEED_CACHE = {"第12期十段戦敗者復活戦2回戦": "2nd round of the 12th Judansen loser's comeback match", "九段": "9th dan", "第11期十段戦本戦1回戦": "11th Judansen Main Tournament 1st round", "第2期名人戦（旧）リーグ": "2nd Meijin Tournament (old) League", "第1期名人戦（旧）リーグ": "1st Meijin Tournament (old) League", "第12期十段戦本戦2回戦": "2nd round of the 12th Judansen Main Tournament", "七段": "Seven sections", "第21期王座戦1回戦": "21st championship match 1st round", "第12期十段戦本戦1回戦": "12th Judansen Main Tournament 1st round", "第20期王座戦準決勝": "20th championship semi-final", "第11期十段戦敗者復活戦2回戦": "2nd round of the 11th Judansen loser's comeback match", "第20期王座戦2回戦": "20th Championship Round 2", "第11期十段戦敗者復活戦1回戦": "11th Judansen Loser Repechage Round 1", "第20期王座戦1回戦": "20th Championship Round 1", "八段": "Eighth paragraph", "第9期プロ十傑戦順位決定戦": "9th professional top ten ranking deciding match", "第9期プロ十傑戦2回戦": "2nd round of the 9th professional top ten tournament", "第8期プロ十傑戦順位決定戦": "8th professional top ten ranking deciding match", "第19期王座戦1回戦": "19th championship match 1st round", "第8期プロ十傑戦2回戦": "2nd round of the 8th professional top ten tournament", "第8期プロ十傑戦1回戦": "1st round of the 8th professional top ten tournament", "第7期プロ十傑戦五位決定戦": "7th professional ten best match 5th place deciding match", "第18期王座戦1回戦": "18th championship match 1st round", "第7期プロ十傑戦順位決定戦": "7th professional top ten ranking deciding match", "第7期プロ十傑戦3回戦": "3rd round of the 7th professional top ten tournament", "第7期プロ十傑戦2回戦": "2nd round of the 7th professional top ten tournament", "第7期プロ十傑戦1回戦": "1st round of the 7th professional top ten tournament", "第17期王座戦1回戦": "1st round of the 17th championship match", "第6期プロ十傑戦順位決定戦": "6th professional top ten ranking deciding match", "第6期プロ十傑戦2回戦": "2nd round of the 6th professional top ten tournament", "第6期プロ十傑戦1回戦": "1st round of the 6th professional top ten tournament", "五段": "fifth section", "第16期王座戦2回戦": "2nd round of the 16th championship match", "第16期王座戦1回戦": "1st round of the 16th championship match", "第5期プロ十傑戦五位決定戦": "5th professional ten best match 5th place deciding match", "第5期プロ十傑戦3回戦": "3rd round of the 5th professional top ten tournament", "第5期プロ十傑戦2回戦": "2nd round of the 5th professional top ten tournament", "大窪一玄": "Kazugen Okubo", "第5期プロ十傑戦1回戦": "1st round of the 5th professional top ten tournament", "第15期王座戦2回戦": "2nd round of the 15th championship match", "第15期王座戦1回戦": "15th championship match 1st round", "第4期名人戦（旧）リーグ": "4th Meijin Tournament (old) League", "第3期名人戦（旧）リーグ": "3rd Meijin Tournament (old) League", "第3期日本最強決定戦リーグ": "3rd Japan Strongest League", "岩田正男": "Masao Iwata", "第2期日本最強決定戦リーグ": "2nd Japan Strongest League", "六段": "six sections", "第1期日本最強決定戦リーグ": "1st Japan Strongest League"};

let cache = { ...SEED_CACHE };

function persist() {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        }
    } catch (_) {
        /* storage unavailable (private mode, Node, etc.) */
    }
}

function restore() {
    try {
        if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) cache = { ...SEED_CACHE, ...JSON.parse(raw) };
        }
    } catch (_) {
        /* ignore corrupt/unavailable cache */
    }
}
restore();

export function getCache() {
    return { ...cache };
}

export function loadCache(entries) {
    cache = { ...cache, ...entries };
    persist();
}

/* Heuristic: does this string already look like English (ASCII words)? */
export function isEnglish(s) {
    return /^[a-zA-Z0-9 _\-\.]+$/.test(s ?? '');
}

/**
 * Translate Japanese/Chinese/Korean text to English.
 * Returns the input unchanged for empty/ASCII strings and when the network
 * call fails. Cached results are reused (persisted to localStorage in browsers).
 *
 * @param {string} text
 * @param {{delayMs?: number, fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<string>}
 */
export async function translate(text, opts = {}) {
    const { delayMs = 100, fetchImpl = fetch } = opts;
    text = (text ?? '').trim();
    if (!text || isEnglish(text)) return text;
    if (GO_TERMS[text] !== undefined) return GO_TERMS[text];
    if (cache[text] !== undefined) return cache[text];

    let result = text;
    try {
        const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=' +
            encodeURIComponent(text);
        const res = await fetchImpl(url);
        const json = await res.json();
        const translated = json?.[0]?.[0]?.[0];
        if (translated && translated.trim()) {
            result = translated.trim();
        }
    } catch (_) {
        /* fall through with the original text */
    }
    cache[text] = result;
    persist();
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return result;
}

/** Resolve a dan rank string, preferring RANK_MAP, else Google. */
export async function translateRank(s, opts = {}) {
    s = (s ?? '').trim();
    if (!s) return s;
    return RANK_MAP[s] ?? translate(s, opts);
}

/** Resolve a player name, preferring PLAYER_LOOKUP, else Google. */
export async function resolvePlayer(name, opts = {}) {
    name = (name ?? '').trim();
    if (!name) return 'Unknown';
    if (isEnglish(name)) return name;
    if (PLAYER_LOOKUP[name]) return PLAYER_LOOKUP[name];
    return (await translate(name, opts)) || name;
}

function capWord(word) {
    const m = word.match(/^([^A-Za-z]*)([A-Za-z])/);
    if (!m) return word;
    const prefix = m[1];
    if (/[0-9]/.test(prefix)) return word;
    return prefix + m[2].toUpperCase() + word.slice(m[1].length + 1);
}

/** Format an event title as Title Case, mirroring the shell script. */
export function titleCase(s) {
    s = (s ?? '').trim();
    const words = s.split(' ');
    return words
        .map((word, idx) => {
            if (!word) return word;
            if (idx === 0 || idx === words.length - 1) return capWord(word);
            return LOWER_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : capWord(word);
        })
        .join(' ');
}

export function sanitizeFilename(s) {
    return (s ?? '').replace(/[/\\:*?"<>|\r\n\t]/g, '_');
}

export function filenamePart(s) {
    return sanitizeFilename((s ?? '').replace(/ /g, '-'));
}

/** Build the English-mode SGF filename, mirroring make_eng_fname(). */
export function englishFilename(date, ev, pb, pw, result) {
    const d = date || '0000-00-00';
    return `${d}__${filenamePart(ev)}__${filenamePart(pb)}__${filenamePart(pw)}__(${sanitizeFilename(result)}).sgf`;
}

/* ------------------------------------------------------------------ *
 * SGF-level translation (web use case):
 *   1. translateSgf()          - translate every non-English value INSIDE an SGF
 *   2. englishFilenameFromSgf()- derive an English download filename from the SGF
 * ------------------------------------------------------------------ */

/* Root properties whose text gets translated. EV/GN are Title Cased. */
const ROOT_TEXT_PROPS = new Set([
    'EV', 'GN', 'PB', 'PW', 'BR', 'WR', 'PC', 'SO', 'US', 'ON', 'AN', 'CP',
]);

function decodeSgfValue(raw) {
    let out = '';
    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (c === '\\' && i + 1 < raw.length) {
            const n = raw[++i];
            out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
        } else {
            out += c;
        }
    }
    return out;
}

function encodeSgfValue(s) {
    return (s ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/\]/g, '\\]')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t');
}

/**
 * Walk an SGF's property values, calling cb(isRoot, propId, valueStart, valueEnd)
 * for every value. Root = first node; comments (C) are translated everywhere.
 */
function sgfRootStart(sgfText) {
    const paren = sgfText.indexOf('(;');
    if (paren !== -1) return paren;
    return sgfText.indexOf(';');
}

function walkSgfValues(sgfText, cb) {
    const start = sgfRootStart(sgfText);
    if (start === -1) return;
    let nodeCount = 0;
    let inValue = false;
    let escape = false;
    let valStart = 0;
    let propId = '';
    for (let i = start; i < sgfText.length; i++) {
        const c = sgfText[i];
        if (inValue) {
            if (escape) {
                escape = false;
            } else if (c === '\\') {
                escape = true;
            } else if (c === ']') {
                cb(nodeCount === 1, propId, valStart, i);
                inValue = false;
                propId = '';
            }
        } else {
            if (c === ';') {
                nodeCount++;
                propId = '';
            } else if (c === '[') {
                inValue = true;
                valStart = i + 1;
            } else if (/[A-Za-z]/.test(c)) {
                propId += c;
            } else {
                propId = '';
            }
        }
    }
}

/** Extract the decoded first value of every root property. */
export function rootProps(sgfText) {
    const props = {};
    walkSgfValues(sgfText, (isRoot, id, start, end) => {
        if (isRoot && id && props[id] === undefined) {
            props[id] = decodeSgfValue(sgfText.slice(start, end));
        }
    });
    return props;
}

/**
 * Translate every non-English value inside an SGF file in place:
 *   - root EV/GN        -> Title Case translation
 *   - root PB/PW        -> resolvePlayer()
 *   - root BR/WR        -> translateRank()
 *   - root PC/SO/US/ON/AN/CP -> translate()
 *   - C comments anywhere      -> translate()
 * Formatting, layout, and all other properties are preserved exactly.
 *
 * @param {string} sgfText raw SGF text
 * @param {{delayMs?: number, fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<string>} the SGF with translated values
 */
export async function translateSgf(sgfText, opts = {}) {
    const { delayMs = 100, fetchImpl = fetch } = opts;
    if (sgfRootStart(sgfText) === -1) return sgfText;

    const targets = [];
    walkSgfValues(sgfText, (isRoot, id, start, end) => {
        if (!id) return;
        const translatable = isRoot ? ROOT_TEXT_PROPS.has(id) : id === 'C';
        if (!translatable) return;
        const decoded = decodeSgfValue(sgfText.slice(start, end));
        if (!decoded || isEnglish(decoded)) return;
        targets.push({ id, start, end, decoded });
    });

    const translated = new Map();
    for (const t of targets) {
        if (translated.has(t.decoded)) continue;
        let result;
        if (t.id === 'PB' || t.id === 'PW') {
            result = await resolvePlayer(t.decoded, { delayMs, fetchImpl });
        } else if (t.id === 'BR' || t.id === 'WR') {
            result = await translateRank(t.decoded, { delayMs, fetchImpl });
        } else {
            const tr = await translate(t.decoded, { delayMs, fetchImpl });
            result = t.id === 'EV' || t.id === 'GN' ? titleCase(tr) : tr;
        }
        translated.set(t.decoded, result);
    }

    const replacements = targets
        .filter((t) => translated.get(t.decoded) && translated.get(t.decoded) !== t.decoded)
        .map((t) => ({
            start: t.start,
            end: t.end,
            replacement: encodeSgfValue(translated.get(t.decoded)),
        }))
        .sort((a, b) => b.start - a.start);

    let out = sgfText;
    for (const r of replacements) {
        out = out.slice(0, r.start) + r.replacement + out.slice(r.end);
    }
    return out;
}

/**
 * Derive an English download filename directly from an SGF file, translating
 * the event/players as needed (mirrors the shell script's English mode):
 *   <date>__<Title-Cased-Event>__<Black>__<White>__(<Result>).sgf
 *
 * @param {string} sgfText raw SGF text
 * @param {{delayMs?: number, fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<string>} e.g. "1973-09-19__2nd-Round...__Go-Seigen__Handa-Dogen__(W+2.5).sgf"
 */
export async function englishFilenameFromSgf(sgfText, opts = {}) {
    const { delayMs = 100, fetchImpl = fetch } = opts;
    const props = rootProps(sgfText);
    const rawEv = props['EV'] ?? props['GN'] ?? '';
    const ev = isEnglish(rawEv)
        ? rawEv
        : titleCase(await translate(rawEv, { delayMs, fetchImpl }));
    const pb = await resolvePlayer(props['PB'] ?? '', { delayMs, fetchImpl });
    const pw = await resolvePlayer(props['PW'] ?? '', { delayMs, fetchImpl });
    return englishFilename(props['DT'] ?? '', ev, pb, pw, props['RE'] ?? '');
}

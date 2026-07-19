/**
 * foxwq-sgf.js — Fetch SGF from foxwq.com, return { sgf, filename }
 * Drop-in for webapp: call window.FoxwqSGF.fetch(url) → Promise<{sgf, filename}>
 */
(function (global) {
    'use strict';

    var PLAYER_MAP = {
        // Korean
        '신진서':   'Shin_Jinseo',
        '박정환':   'Park_Junghwan',
        '이세돌':   'Lee_Sedol',
        '최철한':   'Cho_Chikun',
        '변상일':   'Byun_Sangil',
        '김명원':   'Kim_Mingwon',
        '강동윤':   'Kang_Dongyun',
        '이동훈':   'Lee_Donghoon',
        '원성진':   'Won_Seongjin',
        '한승주':   'Han_Seungju',
        '홍성지':   'Hong_Seongji',
        '윤찬희':   'Yoon_Chanhee',
        '김승재':   'Kim_Seungjae',
        '신민준':   'Shin_Minjun',
        '국제현':   'Kuk_Jeehyun',
        '안정기':   'An_Jeongki',
        '설현준':   'Seol_Hyunjun',
        '김은지':   'Kim_Eunji',
        '최정':     'Choi_Jeong',
        '노승현':   'Noh_Seunghyun',
        '백성혁':   'Baek_Seonghyeok',
        // Korean (Chinese chars — foxwq.com uses these)
        '申真谞':   'Shin_Jinseo',
        '朴廷桓':   'Park_Junghwan',
        '李世石':   'Lee_Sedol',
        '崔哲瀚':   'Cho_Chikun',
        '卞相壹':   'Byun_Sangil',
        '姜东润':   'Kang_Dongyun',
        '李东勋':   'Lee_Donghoon',
        '元晟溱':   'Won_Seongjin',
        '韩升周':   'Han_Seungju',
        '洪性志':   'Hong_Seongji',
        '尹灿熙':   'Yoon_Chanhee',
        '金承在':   'Kim_Seungjae',
        '申旻埈':   'Shin_Minjun',
        '金恩持':   'Kim_Eunji',
        '崔精':     'Choi_Jeong',
        '金明煜':   'Kim_Mingwon',
        // Chinese
        '柯洁':     'Ke_Jie',
        '辜梓豪':   'Gu_Zihao',
        '芈昱廷':   'Mi_Yuting',
        '杨鼎新':   'Yang_Dingxin',
        '李轩豪':   'Li_Xuanhao',
        '范廷钰':   'Fan_Tingyu',
        '时越':     'Shi_Yue',
        '陈耀烨':   'Chen_Yaoye',
        '唐韦星':   'Tang_Weixing',
        '江维杰':   'Jiang_Weijie',
        '周睿羊':   'Zhou_Ruiyang',
        '柁嘉熹':   'Tuo_Jiaxi',
        '古力':     'Gu_Li',
        '常昊':     'Chang_Hao',
        '孔杰':     'Kong_Jie',
        '党毅飞':   'Dang_Yifei',
        '丁浩':     'Ding_Hao',
        '赵晨宇':   'Zhao_Chenyu',
        '谢科':     'Xie_Ke',
        '连笑':     'Lian_Xiao',
        '檀啸':     'Tan_Xiao',
        '王星昊':   'Wang_Xinghao',
        // Japanese
        '井山裕太': 'Iyama_Yuta',
        '张栩':     'Cho_U',
        '山下敬吾': 'Yamashita_Keigo',
        '高尾绅路': 'Takao_Shinji',
        '依田纪基': 'Yoda_Norimoto',
        '赵治勋':   'Cho_Chikun',
        '王立诚':   'O_Rissei',
        '小林光一': 'Kobayashi_Koichi',
        '加藤正夫': 'Kato_Masao',
        '武宫正树': 'Takemiya_Masaki',
        '大竹英雄': 'Otake_Hideo',
        '一力辽':   'Ichiriki_Ryo',
        '芝野虎丸': 'Shibano_Tomoya',
        '许家元':   'Cho_Kaiken',
        '余正麒':   'Yo_Shoki',
        '关航太郎': 'Seki_Kotaro'
    };

    // ── Helpers ──
    var CORS_PROXY = 'https://api.allorigins.win/raw?url=';

    function httpGet(url, useProxy) {
        var target = (useProxy && typeof window !== 'undefined')
            ? CORS_PROXY + encodeURIComponent(url)
            : url;
        return fetch(target).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
        });
    }

    function sanitize(text) {
        return text
            .replace(/[\/\\:*?"<>|]/g, '_')
            .replace(/__+/g, '_')
            .replace(/^_|_$/g, '')
            .substring(0, 40);
    }

    function isEnglish(text) {
        return /^[a-zA-Z0-9 _-]+$/.test(text);
    }

    function lookupPlayer(name) {
        return PLAYER_MAP[name] || '';
    }

    function translateToEng(text) {
        var encoded = encodeURIComponent(text);
        var api = 'https://translate.googleapis.com/translate_a/single'
                + '?client=gtx&sl=auto&tl=en&dt=t&q=' + encoded;
        return httpGet(api, false).then(function (body) {
            try {
                var data = JSON.parse(body);
                if (data && data[0] && data[0][0] && data[0][0][0]) {
                    return data[0][0][0];
                }
            } catch (e) { /* parse error */ }
            return text;
        }).catch(function () {
            return text;
        });
    }

    function resolveName(name, html) {
        if (!name) return Promise.resolve('Unknown');
        if (isEnglish(name)) return Promise.resolve(sanitize(name));

        var eng = lookupPlayer(name);
        if (eng) return Promise.resolve(eng);

        // Fallback: try page title for an English name
        var titleMatch = html.match(/<title>([^<]*)<\/title>/);
        if (titleMatch) {
            var title = titleMatch[1].replace(/&nbsp;/g, ' ');
            var words = title.match(/[A-Za-z][A-Za-z0-9_.-]+[A-Za-z]/g);
            if (words) {
                var skip = /^(html|http|com|foxwq|newlist|id|qipu)$/i;
                for (var i = 0; i < words.length; i++) {
                    if (!skip.test(words[i]) && isEnglish(words[i])) {
                        return Promise.resolve(sanitize(words[i]));
                    }
                }
            }
        }

        // Fallback: Google Translate
        return translateToEng(name).then(function (translated) {
            if (translated && translated !== name) {
                return sanitize(translated);
            }
            return sanitize(name);
        });
    }

    function extractSGF(html) {
        var containerMatch = html.match(/<div[^>]*id="player-container">([\s\S]*?)<\/div>/);
        if (!containerMatch) return '';
        var raw = containerMatch[1];
        raw = raw.replace(/<[^>]*>/g, '');
        raw = raw.replace(/&nbsp;/g, ' ')
                 .replace(/&gt;/g, '>')
                 .replace(/&lt;/g, '<')
                 .replace(/&amp;/g, '&')
                 .replace(/&#?[0-9]*;/g, '');
        raw = raw.replace(/\/"[a-z]*/g, '');
        raw = raw.replace(/^\s+|\s+$/g, '').split('\n')
                 .filter(function (l) { return l.trim(); }).join('\n');
        return raw;
    }

    function extractProp(sgf, prop) {
        var re = new RegExp(prop + '\\[([^\\]]*)\\]');
        var m = sgf.match(re);
        return m ? m[1] : '';
    }

    // ── Public API ──
    function fetchFoxwqSGF(url) {
        if (!url || url.indexOf('foxwq.com/qipu/newlist/id/') === -1) {
            return Promise.reject(new Error('Not a valid foxwq game URL'));
        }

        return httpGet(url, true).then(function (html) {
            var sgf = extractSGF(html);
            if (!sgf || sgf.substring(0, 2) !== '(;)') {
                throw new Error('Could not extract SGF from page');
            }

            var pw = extractProp(sgf, 'PW');
            var pb = extractProp(sgf, 'PB');
            var dt = extractProp(sgf, 'DT');
            var re = extractProp(sgf, 'RE');
            var gn = extractProp(sgf, 'GN');

            var eventRaw = gn.replace(/<[^>]*>/g, '').trim();
            var eventPromise = (eventRaw && /[^a-zA-Z0-9 _-]/.test(eventRaw))
                ? translateToEng(eventRaw)
                : Promise.resolve(eventRaw);

            return eventPromise.then(function (eventTranslated) {
                var event = eventTranslated
                    .replace(/ /g, '-')
                    .replace(/[\/\\:*?"<>|]/g, '_')
                    .replace(/__+/g, '_')
                    .replace(/^_|_$/g, '');

                return Promise.all([
                    resolveName(pb, html),
                    resolveName(pw, html)
                ]).then(function (names) {
                    var pbEng = names[0];
                    var pwEng = names[1];

                    var filename = event
                        ? dt + '__' + event + '__' + pbEng + '__' + pwEng + '__(' + re + ').sgf'
                        : dt + '__' + pbEng + '__' + pwEng + '__(' + re + ').sgf';

                    return { sgf: sgf, filename: filename };
                });
            });
        });
    }

    // ── Export ──
    global.FoxwqSGF = { fetch: fetchFoxwqSGF };

})(typeof window !== 'undefined' ? window : this);

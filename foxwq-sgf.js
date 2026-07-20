/**
 * foxwq-sgf.js — Fetch SGF from foxwq.com (new API), return { sgf, filename }
 * Drop-in for webapp: call window.FoxwqSGF.fetch(url) → Promise<{sgf, filename}>
 * No CORS proxy needed — the h5.foxwq.com APIs have Access-Control-Allow-Origin: *
 */
(function (global) {
    'use strict';

    var PLAYER_MAP = {
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
        '许嘉阳':   'Xu_Jiayang',
        '李维清':   'Li_Weiqing',
        '廖元赫':   'Liao_Yuanhe',
        '屠晓宇':   'Tu_Xiaoyu',
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

    function httpGet(url) {
        return fetch(url).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
        });
    }

    function httpGetJSON(url) {
        return httpGet(url).then(function (text) {
            return JSON.parse(text);
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
        return httpGet(api).then(function (body) {
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

    function resolveName(name) {
        if (!name) return Promise.resolve('Unknown');
        if (isEnglish(name)) return Promise.resolve(sanitize(name));

        var eng = lookupPlayer(name);
        if (eng) return Promise.resolve(eng);

        return translateToEng(name).then(function (translated) {
            if (translated && translated !== name) {
                return sanitize(translated);
            }
            return sanitize(name);
        });
    }

    // ── SGF Tree Parser ──
    // The API returns SGF with deep nesting: each move in its own variation.
    // Main line = longest path through the tree (first child at each branch).
    // AI analysis variations contain "jueyi" in C[] comments.

    function parseSGFTree(sgfStr) {
        var pos = 0;
        var len = sgfStr.length;
        var nodes = [];
        var children = [];

        function parseTree() {
            var treeNodes = [];
            var treeChildren = [];

            while (pos < len) {
                var c = sgfStr[pos];
                if (c === '(') {
                    pos++;
                    treeChildren.push(parseTree());
                } else if (c === ')') {
                    pos++;
                    break;
                } else if (c === ';') {
                    pos++;
                    var moveMatch = sgfStr.substring(pos).match(/^([BW]\[[a-z][a-z]\])/);
                    if (moveMatch) {
                        treeNodes.push(moveMatch[1]);
                        pos += moveMatch[1].length;
                    }
                    // Skip properties (C[...], etc.)
                    skipProperties();
                } else {
                    pos++;
                }
            }

            return { nodes: treeNodes, children: treeChildren };
        }

        function skipProperties() {
            while (pos < len) {
                var c = sgfStr[pos];
                if (c === '[') {
                    var depth = 1;
                    pos++;
                    while (pos < len && depth > 0) {
                        if (sgfStr[pos] === '[') depth++;
                        else if (sgfStr[pos] === ']') depth--;
                        pos++;
                    }
                } else if (c === ';' || c === '(' || c === ')') {
                    break;
                } else {
                    pos++;
                }
            }
        }

        function extractMainLine(tree) {
            var result = tree.nodes.slice();
            if (tree.children.length > 0) {
                result = result.concat(extractMainLine(tree.children[0]));
            }
            return result;
        }

        var tree = parseTree();
        return extractMainLine(tree);
    }

    function extractHeaderProps(sgfStr) {
        var props = {};
        var re = /([A-Z][A-Z])\[([^\]]*)\]/g;
        var m;
        while ((m = re.exec(sgfStr)) !== null) {
            if (!props[m[1]]) props[m[1]] = m[2];
        }
        return props;
    }

    // ── Public API ──
    function fetchFoxwqSGF(url) {
        if (!url || url.indexOf('foxwq.com') === -1) {
            return Promise.reject(new Error('Not a valid foxwq game URL'));
        }

        // Extract chessid from URL (supports both new h5 share URLs and old /id/ format)
        var chessidMatch = url.match(/chessid=(\d+)/)
                        || url.match(/\/id\/(\d+)\.html/);
        if (!chessidMatch) {
            return Promise.reject(new Error('Could not extract chessid from URL'));
        }
        var chessid = chessidMatch[1];

        var API_BASE = 'https://h5.foxwq.com/yehuDiamond/chessbook_local';
        var metaUrl = API_BASE + '/FetchChessSummaryByChessID?with_edu=1&chessid=' + chessid + '&uid=undefined';
        var sgfUrl = API_BASE + '/YHWQFetchChess?chessid=' + chessid;

        return Promise.all([httpGetJSON(metaUrl), httpGetJSON(sgfUrl)])
            .then(function (results) {
                var metaResp = results[0];
                var sgfResp = results[1];

                if (metaResp.result !== 0 || !metaResp.chesslist) {
                    throw new Error('Metadata API returned error');
                }
                if (sgfResp.result !== 0 || !sgfResp.chess) {
                    throw new Error('SGF API returned error');
                }

                var cl = metaResp.chesslist;
                var pb = cl.blacknick || '';
                var pw = cl.whitenick || '';
                var winner = cl.winner || 0;
                var point = cl.point || 0;
                var reason = cl.reason || 0;
                var dt = (cl.starttime || '').split(' ')[0] || '';
                var title = cl.title || '';

                // Build result string
                var resultStr;
                if (reason === 1) {
                    resultStr = (winner === 1 ? 'B' : 'W') + '+R';
                } else {
                    resultStr = (winner === 1 ? 'B' : 'W') + '+' + (point / 100).toFixed(1);
                }

                // Parse SGF and extract main line
                var chessStr = sgfResp.chess.replace(/\\r\\n/g, '\n');
                var headerProps = extractHeaderProps(chessStr);
                var mainLine = parseSGFTree(chessStr);

                // Build clean SGF
                var sgfParts = [';'];
                var headerKeys = ['GM', 'FF', 'SZ', 'GN', 'DT', 'PB', 'PW', 'BR', 'WR', 'KM', 'HA', 'RU', 'AP', 'RE', 'TM', 'TC', 'TT', 'RL'];
                for (var i = 0; i < headerKeys.length; i++) {
                    var key = headerKeys[i];
                    if (headerProps[key]) {
                        sgfParts.push(key + '[' + headerProps[key] + ']');
                    }
                }

                for (var j = 0; j < mainLine.length; j++) {
                    sgfParts.push(';' + mainLine[j]);
                }

                var sgf = sgfParts.join('');

                // Translate title for filename
                var eventPromise = (title && /[^a-zA-Z0-9 _-]/.test(title))
                    ? translateToEng(title)
                    : Promise.resolve(title);

                return eventPromise.then(function (eventTranslated) {
                    var event = eventTranslated
                        ? eventTranslated
                            .replace(/ /g, '-')
                            .replace(/[\/\\:*?"<>|]/g, '_')
                            .replace(/__+/g, '_')
                            .replace(/^_|_$/g, '')
                        : '';

                    return Promise.all([resolveName(pb), resolveName(pw)]).then(function (names) {
                        var pbEng = names[0];
                        var pwEng = names[1];

                        var filename = event
                            ? dt + '__' + event + '__' + pbEng + '__' + pwEng + '__(' + resultStr + ').sgf'
                            : dt + '__' + pbEng + '__' + pwEng + '__(' + resultStr + ').sgf';

                        return { sgf: sgf, filename: filename };
                    });
                });
            });
    }

    // ── Export ──
    global.FoxwqSGF = { fetch: fetchFoxwqSGF };

})(typeof window !== 'undefined' ? window : this);

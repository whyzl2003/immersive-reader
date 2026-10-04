// 词根词缀词条结构定义
export interface WordAnalysis {
  root: string;
  affixes: string;
  note: string;
}

// 静态词根词缀词典（内存直读，兼容 Cloudflare Edge Runtime）
export const ROOTS_DICTIONARY: Record<string, any> = {
  civilized: {
    root: "civil (公民的)",
    affixes: "-ize (动词后缀) + -ed (形容词后缀)",
    note: "使脱离野蛮状态，具有文化与教养",
  },
  history: {
    root: "histor (知者，懂法律的人)",
    affixes: "-y (名词后缀)",
    note: "通过调查探求获得的系统知识",
  },
  curiosity: {
    root: "cura (关照，注意)",
    affixes: "-ious (形容词后缀) + -ity (名词后缀)",
    note: "对新鲜事物的关切与求知渴望",
  },
  erudition: {
    root: "rudis (粗糙，蒙昧)",
    affixes: "e- (向外，脱离) + -ition (名词后缀)",
    note: "摆脱粗野无知，学识渊博",
  },
  inventors: {
    root: "vent (来，到达)",
    affixes: "in- (进入) + -or (人) + -s (复数)",
    note: "探索未知并开创新事物的人",
  },
  inventor: {
    root: "vent (来，到达)",
    affixes: "in- (进入) + -or (人)",
    note: "探索未知并开创新事物的人",
  },
  memory: {
    root: "memor (留心，记住)",
    affixes: "-y (名词后缀)",
    note: "存留于大脑的往事印记",
  },
  adventure: {
    root: "vent (来，发生)",
    affixes: "ad- (去向) + -ure (名词后缀)",
    note: "向未知与偶然进发的经历",
  },
  conqueror: {
    root: "quer (求索，获得)",
    affixes: "con- (彻底) + -or (人)",
    note: "以强力彻底克制并征服者",
  },
  prehistory: {
    root: "histor (知者，历史)",
    affixes: "pre- (在...之前)",
    note: "人类拥有文字记录之前的远古历史",
  },
};

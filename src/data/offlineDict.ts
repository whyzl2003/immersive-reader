/**
 * 离线核心基础词典与英文词形还原（Lemmatization）引擎
 * 专用于飞行断网模式下的 0 延迟本地查词兜底
 */

// 常见不规则变形对照表（过去式、过去分词、不规则复数）
const IRREGULAR_WORDS_MAP: Record<string, string> = {
  was: "be", were: "be", been: "be", am: "be", is: "be", are: "be",
  had: "have", has: "have",
  did: "do", does: "do", done: "do",
  went: "go", gone: "go", goes: "go",
  came: "come",
  said: "say",
  made: "make",
  took: "take", taken: "take",
  knew: "know", known: "know",
  thought: "think",
  saw: "see", seen: "see",
  got: "get", gotten: "get",
  told: "tell",
  found: "find",
  gave: "give", given: "give",
  built: "build",
  wrote: "write", written: "write",
  became: "become",
  began: "begin", begun: "begin",
  learnt: "learn", learned: "learn",
  left: "leave",
  felt: "feel",
  brought: "bring",
  kept: "keep",
  held: "hold",
  stood: "stand",
  heard: "hear",
  meant: "mean",
  set: "set",
  put: "put",
  read: "read",
  ran: "run",
  lost: "lose",
  paid: "pay",
  spoke: "speak", spoken: "speak",
  understood: "understand",
  met: "meet",
  led: "lead",
  sat: "sit",
  chose: "choose", chosen: "choose",
  fought: "fight",
  drew: "draw", drawn: "draw",
  spent: "spend",
  grew: "grow", grown: "grow",
  won: "win",
  taught: "teach",
  bought: "buy",
  sent: "send",
  fell: "fall", fallen: "fall",
  cut: "cut",
  sold: "sell",
  broke: "break", broken: "break",
  hit: "hit",
  drove: "drive", driven: "drive",
  slept: "sleep",
  flew: "fly", flown: "fly",
  died: "die", dying: "die",
  men: "man", women: "woman", children: "child", feet: "foot", teeth: "tooth", mice: "mouse",
};

/**
 * 轻量级英文词形还原函数 (Lemmatization)
 * 对输入的单词进行多规则词尾剥离与形态还原，输出按优先级排列的可能原形候选列表
 */
export function lemmatize(word: string): string[] {
  const w = word.toLowerCase().trim().replace(/^['"“‘—\-]+|['"”’—\-]+$/g, "");
  if (!w || w.length < 2) return [w];
  const candidates = new Set<string>([w]);

  // 1. 不规则变形表直接匹配
  if (IRREGULAR_WORDS_MAP[w]) {
    candidates.add(IRREGULAR_WORDS_MAP[w]);
  }

  // 2. 常见复数与动词三单规则 (-ies, -ves, -es, -s)
  if (w.endsWith("ies") && w.length > 3) {
    candidates.add(w.slice(0, -3) + "y"); // stories -> story, babies -> baby
  }
  if (w.endsWith("ves") && w.length > 3) {
    candidates.add(w.slice(0, -3) + "f"); // wolves -> wolf
    candidates.add(w.slice(0, -3) + "fe"); // lives -> life, wives -> wife
  }
  if (w.endsWith("es") && w.length > 3) {
    candidates.add(w.slice(0, -2)); // boxes -> box, passes -> pass
    candidates.add(w.slice(0, -1)); // houses -> house
  }
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 2) {
    candidates.add(w.slice(0, -1)); // books -> book, teachers -> teacher
  }

  // 3. 过去式与完成式规则 (-ied, -ed, -d, 双写还原)
  if (w.endsWith("ied") && w.length > 3) {
    candidates.add(w.slice(0, -3) + "y"); // carried -> carry, hurried -> hurry
  }
  if (w.endsWith("ed") && w.length > 3) {
    candidates.add(w.slice(0, -2)); // started -> start, walked -> walk
    candidates.add(w.slice(0, -1)); // lived -> live, examined -> examine
    // 双写辅音还原：stopped -> stop, planned -> plan
    if (w.length > 4 && w[w.length - 3] === w[w.length - 4]) {
      candidates.add(w.slice(0, -3));
    }
  }

  // 4. 进行时与动名词规则 (-ing, 去e还原, 双写还原)
  if (w.endsWith("ing") && w.length > 4) {
    candidates.add(w.slice(0, -3)); // reading -> read, watching -> watch
    candidates.add(w.slice(0, -3) + "e"); // writing -> write, making -> make
    // 双写辅音还原：running -> run, swimming -> swim
    if (w.length > 5 && w[w.length - 4] === w[w.length - 5]) {
      candidates.add(w.slice(0, -4));
    }
  }

  // 5. 副词后缀 -ly / -ily
  if (w.endsWith("ily") && w.length > 4) {
    candidates.add(w.slice(0, -3) + "y"); // happily -> happy, easily -> easy
  }
  if (w.endsWith("ly") && w.length > 3) {
    candidates.add(w.slice(0, -2)); // quickly -> quick, greatly -> great
  }

  // 6. 比较级与最高级 -er / -est
  if (w.endsWith("est") && w.length > 4) {
    candidates.add(w.slice(0, -3)); // faintest -> faint, greatest -> great
    candidates.add(w.slice(0, -2)); // largest -> large
  }
  if (w.endsWith("er") && w.length > 3) {
    candidates.add(w.slice(0, -2)); // smaller -> small, faster -> fast
    candidates.add(w.slice(0, -1)); // larger -> large
  }

  // 7. 形容词后缀 -ful / -less 剥离
  if (w.endsWith("ful") && w.length > 5) {
    candidates.add(w.slice(0, -3)); // stressful -> stress, powerful -> power
  }
  if (w.endsWith("less") && w.length > 6) {
    candidates.add(w.slice(0, -4)); // helpless -> help
  }

  return Array.from(candidates);
}

// 本地核心高频离线词典库（涵盖世界小史与英语通用核心词汇）
export const OFFLINE_CORE_DICTIONARY: Record<string, string> = {
  // 用户特别指定的重点核心词
  stress: "n. 压力；重音；强调 v. 强调；感到焦虑",
  stressful: "adj. 充满压力的；令人紧张的",
  relax: "v. 放松；休息；缓和",
  relaxed: "adj. 放松的；悠闲的",
  relaxing: "adj. 令人轻松的",
  relaxation: "n. 放松；缓和；消遣",
  purpose: "n. 目的；意图；决心；用途",
  purposely: "adv. 故意地；特意地",
  story: "n. 故事；历史；小说；新闻报道",
  stories: "n. 故事（复数）",
  memorise: "v. 记住；熟记；背诵",
  memorize: "v. 记住；熟记；背诵",
  memory: "n. 记忆；回忆；纪念",
  memories: "n. 回忆；记忆（复数）",
  memorial: "n. 纪念馆；纪念碑 adj. 纪念的",
  examine: "v. 检查；调查；考试；测验",
  examination: "n. 检查；考试；审查",
  examiner: "n. 主考官；检验员",
  history: "n. 历史；历史学；发展史",
  historian: "n. 历史学家",
  historic: "adj. 历史上著名的；具有历史意义的",
  historical: "adj. 历史上的；与历史有关的",
  cradle: "n. 摇篮；发源地 v. 轻轻抱着",
  mirror: "n. 镜子；真实写照 v. 反映；映照",
  faint: "adj. 微弱的；模糊的；头晕的 v. 昏厥",
  faintest: "adj. 最微弱的；极其微小的",

  // 通用高频动词
  be: "v. 是；存在",
  have: "v. 有；拥有；进行",
  do: "v. 做；干；行动",
  say: "v. 说；讲；陈述",
  go: "v. 去；走；运转",
  get: "v. 得到；到达；变得",
  make: "v. 制造；使成为",
  know: "v. 知道；认识；了解",
  think: "v. 认为；思考；想",
  take: "v. 拿；花费；采取",
  see: "v. 看见；领会；理解",
  come: "v. 来；到达；发生",
  want: "v. 想要；需要",
  look: "v. 看；看起来 n. 眼神",
  use: "v. 使用；利用 n. 用途",
  find: "v. 找到；发现；发觉",
  give: "v. 给予；提供；交给",
  tell: "v. 告诉；讲述；辨别",
  work: "v. 工作；运转 n. 工作；作品",
  call: "v. 呼唤；称呼；拨打",
  try: "v. 尝试；努力；试验",
  ask: "v. 询问；要求；邀请",
  need: "v. 需要；必须 n. 需求",
  feel: "v. 感觉；觉得；触碰",
  become: "v. 变成；成为",
  leave: "v. 离开；留下；遗忘",
  put: "v. 放置；表达；记下",
  mean: "v. 意味着；意思是",
  keep: "v. 保持；保留；继续",
  let: "v. 让；允许；出租",
  begin: "v. 开始；着手",
  seem: "v. 似乎；好像",
  help: "v. 帮助；促进 n. 救助",
  talk: "v. 谈话；交谈 n. 演讲",
  turn: "v. 转弯；转变；翻转",
  start: "v. 开始；出发；启动",
  show: "v. 展示；表明 n. 演出",
  hear: "v. 听到；得知；倾听",
  play: "v. 玩耍；演奏；扮演",
  run: "v. 奔跑；经营；运转",
  move: "v. 移动；搬家；感动",
  live: "v. 居住；活着 adj. 活的",
  believe: "v. 相信；信任；认为",
  bring: "v. 带来；引起；促使",
  happen: "v. 发生；碰巧",
  write: "v. 书写；写作；著述",
  provide: "v. 提供；供应；规定",
  sit: "v. 坐；就座",
  stand: "v. 站立；承受；忍受",
  lose: "v. 失去；输掉；迷失",
  pay: "v. 支付；付出代价",
  meet: "v. 遇见；满足；相遇",
  include: "v. 包含；包括",
  continue: "v. 继续；延续",
  set: "v. 设置；安放 n. 一套",
  learn: "v. 学习；得知；掌握",
  change: "v. 改变；交换 n. 变化",
  lead: "v. 领导；带领；通向",
  understand: "v. 理解；明白；领会",
  watch: "v. 观看；注视 n. 手表",
  follow: "v. 跟随；遵循；明白",
  stop: "v. 停止；阻止 n. 停顿",
  create: "v. 创造；引起；产生",
  speak: "v. 说话；发言；演说",
  read: "v. 阅读；朗读；显示",
  spend: "v. 花费；度过",
  grow: "v. 生长；成长；增加",
  open: "v. 打开；开创 adj. 开着的",
  walk: "v. 步行；散步 n. 散步",
  win: "v. 赢得；获胜",
  teach: "v. 教导；传授；教训",
  offer: "v. 提供；给予；提议",
  remember: "v. 记住；铭记；回想起",
  consider: "v. 考虑；认为；体贴",
  appear: "v. 出现；显得；似乎",
  buy: "v. 购买；相信",
  serve: "v. 服务；服役；侍候",
  die: "v. 死亡；凋零；渴望",
  send: "v. 发送；派遣；寄出",
  expect: "v. 期待；预期；盼望",
  build: "v. 建造；建立；创立",
  stay: "v. 停留；保持；借宿",
  fall: "v. 落下；跌倒 n. 秋天",
  cut: "v. 切割；削减 n. 伤口",
  reach: "v. 达到；伸出；抵达",
  kill: "v. 杀死；毁灭；消磨",
  remain: "v. 保持；依然；遗留",
  suggest: "v. 建议；暗示；表明",
  raise: "v. 提高；举起；抚养",
  pass: "v. 通过；度过；传递",
  sell: "v. 出售；畅销",
  require: "v. 需要；要求；命令",
  report: "v. 报告；报道 n. 汇报",
  decide: "v. 决定；裁决",
  pull: "v. 拉；拖；拔",
  break: "v. 打破；弄碎 n. 休息",

  // 世界小史/文明/社科高频精选词汇
  civilized: "adj. 文明的；有教养的",
  civilization: "n. 文明；文化；文明社会",
  curiosity: "n. 好奇心；新奇事物",
  curious: "adj. 好奇的；奇特的",
  erudition: "n. 博学；渊博知识",
  erudite: "adj. 博学的；饱学的",
  gentle: "adj. 温和的；文雅的",
  gentleness: "n. 温和；柔和；亲切",
  invent: "v. 发明；创造",
  inventor: "n. 发明家；开创者",
  invention: "n. 发明；创造物",
  discover: "v. 发现；发掘",
  discovery: "n. 发现；新发现的事物",
  ancient: "adj. 古代的；古老的",
  prehistoric: "adj. 史前的",
  prehistory: "n. 史前历史",
  century: "n. 世纪；百年",
  earth: "n. 地球；泥土；陆地",
  world: "n. 世界；人间；领域",
  planet: "n. 行星",
  sun: "n. 太阳；阳光",
  moon: "n. 月亮；月光",
  star: "n. 星星；恒星；明星",
  universe: "n. 宇宙；万物",
  space: "n. 空间；太空；空地",
  time: "n. 时间；时代；次",
  period: "n. 时期；时代；课时",
  age: "n. 时代；年龄；世纪",
  people: "n. 人民；人们；民族",
  human: "adj. 人类的；人性的 n. 人",
  mankind: "n. 人类",
  man: "n. 男人；人类",
  woman: "n. 女人",
  child: "n. 孩子；儿童",
  children: "n. 孩子们（复数）",
  family: "n. 家庭；家族",
  ancestor: "n. 祖先；祖宗",
  grandfather: "n. 祖父；外祖父",
  father: "n. 父亲；始祖",
  mother: "n. 母亲",
  son: "n. 儿子",
  daughter: "n. 女儿",
  king: "n. 国王；君王",
  queen: "n. 王后；女王",
  prince: "n. 王子；亲王",
  princess: "n. 公主；王妃",
  emperor: "n. 皇帝；君主",
  empire: "n. 帝国；庞大企业",
  kingdom: "n. 王国；界",
  palace: "n. 宫殿；王宫",
  castle: "n. 城堡；堡垒",
  throne: "n. 王位；宝座",
  crown: "n. 王冠；王权 v. 加冕",
  ruler: "n. 统治者；直尺",
  rule: "v. 统治；裁定 n. 规则",
  law: "n. 法律；法规；定律",
  judge: "n. 法官；裁判 v. 审判",
  court: "n. 法庭；宫廷；球场",
  power: "n. 力量；权力；政权",
  powerful: "adj. 强大的；有势力的",
  war: "n. 战争；冲突",
  peace: "n. 和平；宁静；安宁",
  battle: "n. 战役；战斗 v. 搏斗",
  fight: "v. 战斗；打架 n. 较量",
  army: "n. 军队；陆军",
  soldier: "n. 士兵；军人",
  knight: "n. 骑士；爵士",
  enemy: "n. 敌人；敌对势力",
  weapon: "n. 武器；兵器",
  sword: "n. 剑；刀",
  shield: "n. 盾牌；保护物 v. 防护",
  arrow: "n. 箭；箭头",
  bow: "n. 弓；鞠躬 v. 弯腰",
  conquer: "v. 征服；战胜",
  conqueror: "n. 征服者；胜利者",
  victory: "n. 胜利；大获全胜",
  defeat: "v. 击溃；打败 n. 失败",
  hero: "n. 英雄；男主角",
  brave: "adj. 勇敢的；无畏的",
  courage: "n. 勇气；胆识",
  danger: "n. 危险；威胁",
  dangerous: "adj. 危险的",
  fear: "n. 恐惧；害怕 v. 惧怕",
  death: "n. 死亡；毁灭",
  dead: "adj. 死亡的；失去知觉的",
  alive: "adj. 活着的；有生气的",
  life: "n. 生命；生活；生平",
  stone: "n. 石头；宝石",
  rock: "n. 岩石；巨石",
  cave: "n. 洞穴；山洞",
  fire: "n. 火；火灾 v. 点燃；开火",
  hunt: "v. 狩猎；捕猎 n. 搜寻",
  hunter: "n. 猎人；搜寻者",
  wild: "adj. 野生的；野蛮的",
  animal: "n. 动物；牲畜",
  beast: "n. 野兽；凶残之人",
  forest: "n. 森林；林区",
  wood: "n. 木材；树林",
  tree: "n. 树木",
  plant: "n. 植物；工厂 v. 种植",
  nature: "n. 自然；本性；天性",
  natural: "adj. 自然的；天生的",
  river: "n. 河流；江水",
  sea: "n. 大海；海洋",
  ocean: "n. 大洋；广阔海洋",
  water: "n. 水 v. 浇灌",
  mountain: "n. 高山；山岳",
  hill: "n. 小山；丘陵",
  valley: "n. 山谷；流域",
  land: "n. 陆地；土地 v. 着陆",
  country: "n. 国家；乡村",
  nation: "n. 民族；国家",
  national: "adj. 国家的；民族的",
  city: "n. 城市；都市",
  town: "n. 城镇；集镇",
  village: "n. 村庄；乡村",
  house: "n. 房屋；住宅",
  wall: "n. 墙壁；城墙",
  door: "n. 门；大门",
  gate: "n. 大门；关口",
  road: "n. 道路；公路线",
  bridge: "n. 桥梁；连结",
  building: "n. 建筑物；房屋",
  temple: "n. 寺庙；神殿",
  church: "n. 教堂；宗教团体",
  cross: "n. 十字架 v. 越过",
  god: "n. 神；上帝",
  goddess: "n. 女神",
  religion: "n. 宗教；信仰",
  religious: "adj. 宗教的；虔诚的",
  priest: "n. 牧师；祭司",
  monk: "n. 僧侣；修士",
  holy: "adj. 神圣的；圣洁的",
  prayer: "n. 祈祷；祷词",
  pray: "v. 祈祷；乞求",
  faith: "n. 信仰；信念；信心",
  belief: "n. 相信；信条",
  spirit: "n. 精神；灵魂；气概",
  soul: "n. 灵魂；心灵",
  shadow: "n. 阴影；暗影",
  light: "n. 光芒；灯火 adj. 明亮的；轻便的",
  dark: "adj. 黑暗的；昏暗的 n. 黑暗",
  darkness: "n. 漆黑；黑暗",
  night: "n. 夜晚；黑夜",
  day: "n. 白天；日子",
  morning: "n. 早晨；清晨",
  evening: "n. 傍晚；晚上",
  year: "n. 年份；岁",
  season: "n. 季节；时令",
  spring: "n. 春天；泉水",
  summer: "n. 夏天；夏季",
  autumn: "n. 秋天；秋季",
  winter: "n. 冬天；寒冬",
  gold: "n. 黄金；金子 adj. 金质的",
  golden: "adj. 金色的；珍贵的",
  silver: "n. 白银；银子 adj. 银质的",
  iron: "n. 铁；铁器",
  bronze: "n. 青铜；铜器",
  metal: "n. 金属",
  wheel: "n. 车轮；轮子",
  cart: "n. 手推车；马车",
  horse: "n. 马",
  grain: "n. 谷物；粮食",
  bread: "n. 面包；生计",
  food: "n. 食物；粮食",
  meat: "n. 肉食",
  wine: "n. 葡萄酒；果酒",
  drink: "v. 喝；饮 n. 饮料",
  eat: "v. 进食；吃",
  sleep: "v. 睡觉 n. 睡眠",
  dream: "n. 梦境；梦想 v. 做梦",
  thought: "n. 思想；思绪；想法",
  mind: "n. 头脑；心思 v. 介意",
  heart: "n. 心脏；心灵；核心",
  eye: "n. 眼睛；目光",
  ear: "n. 耳朵；听力",
  hand: "n. 手掌；帮助 v. 递给",
  voice: "n. 嗓音；声音；话语权",
  word: "n. 单词；话语；誓言",
  words: "n. 言辞；字句（复数）",
  letter: "n. 字母；书信",
  alphabet: "n. 字母表",
  picture: "n. 图片；画作",
  painting: "n. 绘画；油画",
  art: "n. 艺术；美术；技术",
  artist: "n. 艺术家；大师",
  statue: "n. 雕像；塑像",
  pyramid: "n. 金字塔",
  monument: "n. 纪念碑；古迹",
  tomb: "n. 陵墓；坟墓",
  trade: "n. 贸易；商业 v. 交易",
  merchant: "n. 商人；贸易商",
  market: "n. 市场；市集",
  money: "n. 钱财；货币",
  coin: "n. 硬币；铸币",
  rich: "adj. 富有的；丰厚的",
  poor: "adj. 贫穷的；可怜的",
  wealth: "n. 财富；富裕",
  slave: "n. 奴隶",
  freedom: "n. 自由；自主",
  truth: "n. 真相；真理",
  true: "adj. 真实的；准确的",
  lie: "n. 谎言 v. 撒谎；躺下",
  false: "adj. 虚假的；不成立的",
  right: "adj. 正确的；右边的 n. 权利",
  wrong: "adj. 错误的；不道德的",
  good: "adj. 良好的；优秀的",
  bad: "adj. 差劲的；糟糕的",
  noble: "adj. 高贵的；崇高的 n. 贵族",
  peasant: "n. 农民；乡下人",
  sailor: "n. 水手；海员",
  ship: "n. 船只；轮船",
  boat: "n. 小船；艇",
  journey: "n. 旅行；长途跋涉",
  travel: "v. 漫游；旅行 n. 旅途",
  adventure: "n. 探险；奇遇",
  strange: "adj. 奇怪的；陌生的",
  stranger: "n. 陌生人；外来者",
  foreign: "adj. 外国的；异乡的",
  language: "n. 语言；文词",
  tongue: "n. 舌头；语言",
  translate: "v. 翻译；转换",
  translation: "n. 翻译；译文",
  translator: "n. 翻译员；译者",
  book: "n. 书籍；著作 v. 预约",
  page: "n. 书页；页码",
  chapter: "n. 章节；回",
  reader: "n. 读者；读本",
  school: "n. 学校；学派",
  student: "n. 学生；门徒",
  scholar: "n. 学者；文人",
  science: "n. 科学；学科",
  scientist: "n. 科学家",
  knowledge: "n. 知识；学问",
  wisdom: "n. 智慧；哲理",
  wise: "adj. 明智的；聪慧的",
  great: "adj. 伟大的；重大的；出色的",
  small: "adj. 狭小的；微弱的",
  little: "adj. 幼小的；少量的",
  large: "adj. 广大的；巨大的",
  huge: "adj. 庞大的；无限的",
  deep: "adj. 深邃的；深奥的",
  high: "adj. 高耸的；高级的",
  low: "adj. 低下的；微弱的",
  long: "adj. 漫长的；长期的",
  short: "adj. 短促的；简略的",
  beautiful: "adj. 美丽的；迷人的",
  beauty: "n. 美丽；佳人",
  quiet: "adj. 宁静的；轻声的",
  silent: "adj. 沉默的；无声的",
  happy: "adj. 快乐的；幸福的",
  joy: "n. 欢乐；欣喜",
  hope: "v. 希望；寄望 n. 愿望",
  peaceful: "adj. 和平的；安宁的",
  pacifist: "n. 和平主义者 adj. 爱好和平的",
  pacifism: "n. 和平主义",
};

export interface OfflineWordResult {
  translation: string;
  originalWord: string;
  isLemmatized: boolean;
}

/**
 * 离线核心单词查询总入口：支持原词匹配与智能词形还原查找
 * @param rawWord 原始点击单词（允许包含前后符号与大写）
 * @returns 命中释义结构体对象，未命中返回 null
 */
export function lookupOfflineWord(rawWord: string): OfflineWordResult | null {
  const clean = rawWord.toLowerCase().trim().replace(/^['"“‘—\-]+|['"”’—\-]+$/g, "");
  if (!clean) return null;

  // 1. 原词直接精确查找
  if (OFFLINE_CORE_DICTIONARY[clean]) {
    return {
      translation: OFFLINE_CORE_DICTIONARY[clean],
      originalWord: clean,
      isLemmatized: false,
    };
  }

  // 2. 智能词形还原查找（如 stories -> story, relaxing -> relax, examined -> examine）
  const candidates = lemmatize(clean);
  for (const candidate of candidates) {
    if (OFFLINE_CORE_DICTIONARY[candidate]) {
      return {
        translation: OFFLINE_CORE_DICTIONARY[candidate],
        originalWord: candidate,
        isLemmatized: true,
      };
    }
  }

  return null;
}

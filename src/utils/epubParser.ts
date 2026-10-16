/**
 * 纯前端轻量级 EPUB 解析器
 * 基于 JSZip 与原生 DOMParser，无需庞大只读依赖
 * 支持封面与插图提取转换为 Base64 Data URL、保留标题与段落语义层级
 * 具备文件级默认映射、强化路径容错比对、锚点级精准映射与锚点丢失兜底机制，彻底解决 TOC 目录跳转索引错位 Bug
 */
import JSZip from "jszip";

/**
 * 章节目录条目接口定义（与阅读器书架结构对齐）
 */
export interface TocItem {
  id: string;
  title: string;
  startIndex: number;
  paragraphsCount: number;
}

/**
 * 解析后的 EPUB 电子书数据结构
 */
export interface ParsedEpubBook {
  title: string;
  creator?: string;
  paragraphs: string[];
  toc: TocItem[];
}

/**
 * 解析过程中使用的原始 TOC 目录中间结构
 */
interface RawTocEntry {
  id: string;
  title: string;
  targetFilePath: string; // 目标文件路径，如 "chapter02.xhtml" 或 "OEBPS/Text/chapter02.xhtml"
  targetAnchor: string;   // 目标锚点 ID，如 "sec1"，无锚点则为空字符串 ""
  startIndex: number;     // 匹配到的全局段落索引（未匹配前为 -1）
  paragraphsCount?: number;
}

/**
 * 规范化 ZIP 包内的相对路径
 * 将 baseDir 与 relativePath 合并，解析其中的 "." 与 ".."，去除开头的斜杠、查询参数和锚点
 * 例如: resolveZipPath("OEBPS/text", "../images/cover.jpg") => "OEBPS/images/cover.jpg"
 */
function resolveZipPath(baseDir: string, relativePath: string): string {
  const cleanRelative = relativePath.split("#")[0].split("?")[0].replace(/^\/+/, "");
  const combined = baseDir ? `${baseDir}/${cleanRelative}` : cleanRelative;
  const parts = combined.split("/").filter((p) => p && p !== ".");
  const stack: string[] = [];

  for (const part of parts) {
    if (part === "..") {
      stack.pop();
    } else {
      stack.push(part);
    }
  }

  return stack.join("/");
}

/**
 * 拆分 href 中的文件路径与锚点，并解码 URL 编码
 */
function splitHrefAndAnchor(href: string): { filePath: string; anchor: string } {
  const [rawPath, rawAnchor] = href.split("#");
  const cleanPath = (rawPath || "").split("?")[0].trim();
  let decodedPath = cleanPath;
  try {
    decodedPath = decodeURIComponent(cleanPath);
  } catch (e) {
    // 忽略解码异常，使用原始字符串
  }

  let decodedAnchor = (rawAnchor || "").trim();
  try {
    decodedAnchor = decodeURIComponent(decodedAnchor);
  } catch (e) {
    // 忽略解码异常，使用原始字符串
  }

  return {
    filePath: decodedPath,
    anchor: decodedAnchor,
  };
}

/**
 * 标准化文件路径：统一斜杠、移除相对符号并转为小写
 */
function normalizePath(p: string): string {
  if (!p) return "";
  const cleaned = p.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = cleaned.split("/").filter((x) => x && x !== ".");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join("/").toLowerCase();
}

/**
 * 提取文件纯名称（包含扩展名，转小写）
 * 例如: "OEBPS/Text/chapter02.xhtml" => "chapter02.xhtml"
 */
function getFilename(p: string): string {
  if (!p) return "";
  const clean = p.split("#")[0].split("?")[0].replace(/\\/g, "/");
  const parts = clean.split("/");
  return (parts[parts.length - 1] || "").toLowerCase().trim();
}

/**
 * 智能比对两个文件路径是否指向同一个文件（强化路径匹配容错）：
 * 1. 标准化绝对路径完全相等（如 "oebps/text/ch02.xhtml" === "oebps/text/ch02.xhtml"）
 * 2. 相对路径后缀重合（例如 "text/ch02.xhtml" 匹配 "oebps/text/ch02.xhtml"）
 * 3. 纯文件名相同（例如 "ch02.xhtml" 匹配 "oebps/text/ch02.xhtml"，兼容各类 EPUB 生成器路径前缀差异）
 */
function isSameFilePath(pathA: string, pathB: string): boolean {
  if (!pathA || !pathB) return false;
  const normA = normalizePath(pathA);
  const normB = normalizePath(pathB);

  // 1. 标准化路径完全一致
  if (normA === normB) return true;

  // 2. 包含父级相对路径关系
  if (normB.endsWith("/" + normA) || normA.endsWith("/" + normB)) return true;

  // 3. 纯文件名比对（解决电子书 toc.ncx 路径与 Spine 存在前缀差异的问题）
  const fileA = getFilename(normA);
  const fileB = getFilename(normB);
  if (fileA && fileB && fileA === fileB) return true;

  return false;
}

/**
 * 安全转义 CSS 选择器中的特殊字符，避免 querySelector 因特殊字符抛错
 */
function safeEscapeSelector(str: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(str);
  }
  return str.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

/**
 * 清洗并压缩文本中的空白字符
 * 包括 HTML 不换行空格实体 (&nbsp;)、全角空格、\u00A0、零宽字符 (\uFEFF) 等
 */
function sanitizeText(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&(?:nbsp|#160|#xa0);/gi, " ")
    .replace(/[\u00A0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 检查 DOM 元素及其祖先链是否为隐藏不可见元素
 */
function isHiddenElement(el: HTMLElement): boolean {
  let cur: HTMLElement | null = el;
  while (cur && cur.tagName && cur.tagName.toLowerCase() !== "body") {
    if (cur.hasAttribute("hidden")) return true;
    const style = cur.getAttribute("style");
    if (style) {
      const lower = style.toLowerCase();
      if (/display\s*:\s*none/.test(lower) || /visibility\s*:\s*hidden/.test(lower)) {
        return true;
      }
    }
    cur = cur.parentElement;
  }
  return false;
}

/**
 * 解析 EPUB 3 标准的 nav.xhtml 导航文档
 */
function parseNavXhtml(
  navDoc: Document,
  navFullPath: string
): RawTocEntry[] {
  const tocDir = navFullPath.includes("/")
    ? navFullPath.substring(0, navFullPath.lastIndexOf("/"))
    : "";
  const results: RawTocEntry[] = [];
  let counter = 1;

  // 优先查找 epub:type="toc" 或 role="doc-toc" 的 nav 容器
  const navEl =
    navDoc.querySelector('nav[*|type="toc"]') ||
    navDoc.querySelector('nav[epub\\:type="toc"]') ||
    navDoc.querySelector('nav[role="doc-toc"]') ||
    navDoc.querySelector("#toc") ||
    navDoc.querySelector("nav");

  if (!navEl) return results;

  // 递归树状列表抽取目录项
  function traverseList(container: Element) {
    const listChildren = Array.from(container.children).filter(
      (c) => c.tagName.toLowerCase() === "li"
    );

    for (const li of listChildren) {
      // 提取直接属于该 li 的 a 链接
      const a = li.querySelector(":scope > a") || li.querySelector("a");
      if (a) {
        const href = a.getAttribute("href");
        const title = sanitizeText(a.textContent);

        if (href && title) {
          const { filePath, anchor } = splitHrefAndAnchor(href);
          const fullPath = resolveZipPath(tocDir, filePath);
          const id = a.getAttribute("id") || li.getAttribute("id") || `nav_${counter++}`;

          results.push({
            id,
            title,
            targetFilePath: fullPath,
            targetAnchor: anchor,
            startIndex: -1,
          });
        }
      }

      // 递归处理嵌套的子列表 (ol 或 ul)
      const subList =
        li.querySelector(":scope > ol, :scope > ul") ||
        li.querySelector("ol, ul");
      if (subList) {
        traverseList(subList);
      }
    }
  }

  const rootList = navEl.querySelector("ol, ul");
  if (rootList) {
    traverseList(rootList);
  }

  return results;
}

/**
 * 解析 EPUB 2 标准的 toc.ncx 导航文档
 */
function parseNcxXml(
  ncxDoc: Document,
  ncxFullPath: string
): RawTocEntry[] {
  const tocDir = ncxFullPath.includes("/")
    ? ncxFullPath.substring(0, ncxFullPath.lastIndexOf("/"))
    : "";
  const results: RawTocEntry[] = [];
  let counter = 1;

  // 递归遍历 navPoint 节点
  function traverseNavPoints(parent: Element) {
    const points = Array.from(parent.children).filter(
      (c) => c.localName === "navPoint" || c.tagName.toLowerCase() === "navpoint"
    );

    for (const point of points) {
      const id = point.getAttribute("id") || `ncx_${counter++}`;
      const labelEl =
        point.querySelector("navLabel > text") ||
        point.getElementsByTagName("text")[0];
      const title = sanitizeText(labelEl?.textContent);

      const contentEl =
        point.querySelector("content") ||
        point.getElementsByTagName("content")[0];
      const src = contentEl?.getAttribute("src");

      if (src && title) {
        const { filePath, anchor } = splitHrefAndAnchor(src);
        const fullPath = resolveZipPath(tocDir, filePath);

        results.push({
          id,
          title,
          targetFilePath: fullPath,
          targetAnchor: anchor,
          startIndex: -1,
        });
      }

      // 递归嵌套子章节
      traverseNavPoints(point);
    }
  }

  const navMap =
    ncxDoc.querySelector("navMap") ||
    ncxDoc.getElementsByTagName("navMap")[0];
  if (navMap) {
    traverseNavPoints(navMap);
  }

  return results;
}

/**
 * 解析 EPUB 二进制 ArrayBuffer，返回结构化书名、清洗后的段落数组以及精准对齐的 TOC 目录
 *
 * @param arrayBuffer EPUB 二进制文件内容
 * @param fallbackTitle 文件名作为后备书名
 * @returns ParsedEpubBook
 */
export async function parseEpub(
  arrayBuffer: ArrayBuffer,
  fallbackTitle: string = "未命名电子书"
): Promise<ParsedEpubBook> {
  const zip = await JSZip.loadAsync(arrayBuffer);

  // 1. 读取 META-INF/container.xml 找到 .opf 文件入口
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) {
    throw new Error("无效的 EPUB 格式：未在压缩包内发现 META-INF/container.xml");
  }

  const containerXml = await containerFile.async("text");
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, "application/xml");

  const rootfileEl = containerDoc.querySelector("rootfile");
  const opfPath = rootfileEl?.getAttribute("full-path");

  if (!opfPath) {
    throw new Error("无效的 EPUB 格式：container.xml 中未定义 rootfile full-path");
  }

  // 提取 opf 所在的目录前缀
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/")) : "";

  // 2. 读取并解析 OPF 配置文件
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error(`未在压缩包内找到指定的 OPF 清单文件: ${opfPath}`);
  }

  const opfXml = await opfFile.async("text");
  const opfDoc = parser.parseFromString(opfXml, "application/xml");

  // 提取元数据：书名与作者
  const titleEl =
    opfDoc.querySelector("metadata > title") ||
    opfDoc.getElementsByTagNameNS("*", "title")[0] ||
    opfDoc.querySelector("title");
  const cleanTitle = titleEl?.textContent?.trim() || fallbackTitle;

  const creatorEl =
    opfDoc.querySelector("metadata > creator") ||
    opfDoc.getElementsByTagNameNS("*", "creator")[0] ||
    opfDoc.querySelector("creator");
  const creator = creatorEl?.textContent?.trim();

  // 3. 构建 Manifest 资源清单与图片索引表
  const manifestItems = opfDoc.querySelectorAll("manifest > item");
  const itemMap = new Map<string, { fullPath: string; mediaType: string; properties: string }>();
  const imageMap = new Map<string, string>(); // fullPath -> Base64 Data URL
  const imageFilenameMap = new Map<string, string>(); // filename -> Base64 Data URL

  let navPath: string | null = null;
  let ncxPath: string | null = null;

  // 检查 spine 上的 toc 属性（EPUB 2 指向 ncx 文件的 item id）
  const spineEl = opfDoc.querySelector("spine");
  const spineTocId = spineEl?.getAttribute("toc");

  for (let i = 0; i < manifestItems.length; i++) {
    const item = manifestItems[i];
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    const mediaType = item.getAttribute("media-type") || "";
    const properties = item.getAttribute("properties") || "";

    if (id && href) {
      const fullPath = resolveZipPath(opfDir, href);
      itemMap.set(id, { fullPath, mediaType, properties });

      // 检查 EPUB 3 nav 导航文档属性
      if (properties.split(/\s+/).includes("nav")) {
        navPath = fullPath;
      }

      // 检查 EPUB 2 NCX 目录文件
      if (
        (spineTocId && id === spineTocId) ||
        mediaType === "application/x-dtbncx+xml" ||
        href.toLowerCase().endsWith(".ncx")
      ) {
        ncxPath = fullPath;
      }

      // 图片资源预处理：转换为持久化的 Base64 Data URL
      if (mediaType.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(href)) {
        const imgFile = zip.file(fullPath);
        if (imgFile) {
          try {
            const base64 = await imgFile.async("base64");
            const effectiveMediaType =
              mediaType ||
              (fullPath.endsWith(".png")
                ? "image/png"
                : fullPath.endsWith(".svg")
                ? "image/svg+xml"
                : fullPath.endsWith(".webp")
                ? "image/webp"
                : fullPath.endsWith(".gif")
                ? "image/gif"
                : "image/jpeg");
            const dataUrl = `data:${effectiveMediaType};base64,${base64}`;
            imageMap.set(fullPath, dataUrl);

            // 同时建立文件名索引以便相对路径模糊解析
            const filename = fullImgFilename(fullPath);
            if (filename) {
              imageFilenameMap.set(filename, dataUrl);
            }
          } catch (err) {
            console.warn(`[EPUB] 转换插图失败: ${fullPath}`, err);
          }
        }
      }
    }
  }

  // 辅助获取文件名
  function fullImgFilename(p: string) {
    return p.split("/").pop() || "";
  }

  // 兜底查找目录文件：若 manifest 中未显式指定，扫描压缩包文件树
  if (!navPath && !ncxPath) {
    for (const filename of Object.keys(zip.files)) {
      const lower = filename.toLowerCase();
      if (lower.endsWith("nav.xhtml") || lower.endsWith("nav.html")) {
        navPath = filename;
        break;
      }
      if (lower.endsWith(".ncx")) {
        ncxPath = filename;
      }
    }
  }

  // 4. 解析目录文件 (TOC)
  let rawTocList: RawTocEntry[] = [];

  // 优先解析 EPUB 3 标准的 nav.xhtml
  if (navPath) {
    const navFile = zip.file(navPath);
    if (navFile) {
      try {
        const navXml = await navFile.async("text");
        const navDoc = parser.parseFromString(navXml, "text/html");
        rawTocList = parseNavXhtml(navDoc, navPath);
      } catch (e) {
        console.warn("[EPUB] 解析 nav.xhtml 失败，降级尝试解析 toc.ncx:", e);
      }
    }
  }

  // 若 nav.xhtml 未找到或解析为空，解析 EPUB 2 的 toc.ncx
  if (rawTocList.length === 0 && ncxPath) {
    const ncxFile = zip.file(ncxPath);
    if (ncxFile) {
      try {
        const ncxXml = await ncxFile.async("text");
        const ncxDoc = parser.parseFromString(ncxXml, "application/xml");
        rawTocList = parseNcxXml(ncxDoc, ncxPath);
      } catch (e) {
        console.warn("[EPUB] 解析 toc.ncx 失败:", e);
      }
    }
  }

  // 5. 解析 Spine 确定章节正文阅读顺序
  const itemRefs = opfDoc.querySelectorAll("spine > itemref");
  const spineChapterPaths: string[] = [];

  for (let i = 0; i < itemRefs.length; i++) {
    const idref = itemRefs[i].getAttribute("idref");
    if (idref && itemMap.has(idref)) {
      spineChapterPaths.push(itemMap.get(idref)!.fullPath);
    }
  }

  // 若电子书既无 nav.xhtml 也无 toc.ncx，为每个 Spine 章节文件生成默认目录条目
  if (rawTocList.length === 0) {
    spineChapterPaths.forEach((chPath, idx) => {
      rawTocList.push({
        id: `auto_ch_${idx + 1}`,
        title: `第 ${idx + 1} 节`,
        targetFilePath: chPath,
        targetAnchor: "",
        startIndex: -1,
      });
    });
  }

  // 6. 遍历各章节提取富文本节点，并在此过程中同步执行文件级与锚点级精准打标
  const allParagraphs: string[] = [];

  for (const chapterPath of spineChapterPaths) {
    const chapterFile = zip.file(chapterPath);
    if (!chapterFile) continue;

    const chapterHtml = await chapterFile.async("text");
    const chapterDoc = parser.parseFromString(chapterHtml, "text/html");
    const chapterDir = chapterPath.includes("/")
      ? chapterPath.substring(0, chapterPath.lastIndexOf("/"))
      : "";

    // A. 替换所有 <img> 相对路径为 Base64 Data URL
    const imgElements = chapterDoc.querySelectorAll("img");
    imgElements.forEach((img) => {
      const rawSrc = img.getAttribute("src");
      if (rawSrc) {
        const fullImgPath = resolveZipPath(chapterDir, rawSrc);
        const filename = fullImgFilename(fullImgPath);
        const resolvedDataUrl = imageMap.get(fullImgPath) || imageFilenameMap.get(filename);
        if (resolvedDataUrl) {
          img.setAttribute("src", resolvedDataUrl);
        }
      }
    });

    // B. 替换所有 SVG 中的 <image> 标签为标准 <img>
    const svgImages = chapterDoc.querySelectorAll("svg image");
    svgImages.forEach((svgImg) => {
      const href =
        svgImg.getAttribute("href") ||
        svgImg.getAttribute("xlink:href") ||
        "";
      if (href) {
        const fullImgPath = resolveZipPath(chapterDir, href);
        const filename = fullImgFilename(fullImgPath);
        const resolvedDataUrl = imageMap.get(fullImgPath) || imageFilenameMap.get(filename);
        if (resolvedDataUrl) {
          const newImg = chapterDoc.createElement("img");
          newImg.setAttribute("src", resolvedDataUrl);
          svgImg.parentElement?.replaceChild(newImg, svgImg);
        }
      }
    });

    // C. 查找属于当前章节且尚未打标的目录项（强化路径匹配容错）
    const currentChapterTocs = rawTocList.filter(
      (t) => isSameFilePath(t.targetFilePath, chapterPath)
    );

    // 将目录项分为：文件级无锚点项（指向文件开头）与有锚点项（指向具体 id）
    const fileLevelTocs = currentChapterTocs.filter((t) => !t.targetAnchor && t.startIndex === -1);
    const anchorTocs = currentChapterTocs.filter((t) => Boolean(t.targetAnchor) && t.startIndex === -1);

    // 建立锚点 DOM 元素映射表
    const anchorElMap = new Map<RawTocEntry, HTMLElement>();
    for (const toc of anchorTocs) {
      let targetEl: HTMLElement | null = null;
      try {
        targetEl = chapterDoc.getElementById(toc.targetAnchor) as HTMLElement | null;
      } catch (e) {}

      if (!targetEl && toc.targetAnchor) {
        try {
          const escaped = safeEscapeSelector(toc.targetAnchor);
          targetEl = chapterDoc.querySelector(
            `[id="${escaped}"], a[name="${escaped}"]`
          ) as HTMLElement | null;
        } catch (e) {}
      }

      if (targetEl) {
        anchorElMap.set(toc, targetEl);
      }
    }

    const body = chapterDoc.body;
    if (!body) continue;

    // D. 遍历候选块级元素，提取有效段落并实时打标
    let candidateElements = body.querySelectorAll(
      "h1, h2, h3, h4, h5, h6, p, blockquote, li, img"
    );
    if (candidateElements.length === 0) {
      candidateElements = body.querySelectorAll("div, img");
    }

    // 记录本章节提取出的首个有效段落全局索引
    let chapterFirstValidIndex: number | null = null;

    for (let k = 0; k < candidateElements.length; k++) {
      const el = candidateElements[k] as HTMLElement;

      // 1. 严格过滤隐藏标签（如 hidden, display:none 等）
      if (isHiddenElement(el)) {
        continue;
      }

      const tagName = el.tagName.toLowerCase();

      // 2. 避免父子元素重复提取（外层容器包含其他子块级元素时跳过外层）
      if (tagName !== "img") {
        const hasBlockChildren = el.querySelector(
          "h1, h2, h3, h4, h5, h6, p, blockquote, li"
        );
        if (hasBlockChildren) {
          continue;
        }
      }

      let paragraphHtml: string | null = null;

      // 3. 处理独立图片
      if (tagName === "img") {
        const src = el.getAttribute("src");
        if (
          src &&
          (src.startsWith("data:") || src.startsWith("http") || src.startsWith("blob:"))
        ) {
          const alt = (el.getAttribute("alt") || "").replace(/"/g, "&quot;");
          paragraphHtml = `<img src="${src}" alt="${alt}" />`;
        } else {
          continue; // 无效或未解析成功的图片剔除
        }
      } else {
        // 4. 提取纯文本并严格剔除纯空白段落、空白占位与空换行符
        const text = sanitizeText(el.textContent);
        if (!text) {
          // 纯空白节点，坚决不放入段落数组，防止空占下标导致整体索引后移
          continue;
        }

        if (/^h[1-6]$/.test(tagName)) {
          paragraphHtml = `<${tagName}>${text}</${tagName}>`;
        } else {
          paragraphHtml = `<p>${text}</p>`;
        }
      }

      if (!paragraphHtml) continue;

      // 5. 实时精准同步打标（在有效段落被 push 前执行）
      const currentGlobalIndex = allParagraphs.length;

      // 【核心要求 1】：文件级默认映射
      // 在当前章节提取出首个有效正文段落时，立即为所有属于该文件且未带 targetAnchor 的 TOC 项赋值
      if (chapterFirstValidIndex === null) {
        chapterFirstValidIndex = currentGlobalIndex;
        for (const toc of fileLevelTocs) {
          if (toc.startIndex === -1) {
            toc.startIndex = currentGlobalIndex;
          }
        }
      }

      // 【核心要求 2 & 锚点精准匹配】：比对当前有效节点与本章节未打标锚点项的相对位置
      for (const [toc, anchorEl] of Array.from(anchorElMap.entries())) {
        if (toc.startIndex !== -1) continue;

        let isMatch = false;

        // 场景 1：当前提取的块元素自身即为锚点元素
        if (el === anchorEl) {
          isMatch = true;
        }
        // 场景 2：当前段落元素包含锚点元素（如 <p><a id="sec1"></a>正文</p>）
        else if (el.contains(anchorEl)) {
          isMatch = true;
        }
        // 场景 3：锚点元素是当前段落的父级或祖先容器（如 <section id="sec1"><p>正文</p></section>）
        else if (anchorEl.contains(el)) {
          isMatch = true;
        }
        // 场景 4：锚点元素是独立标签，在文档顺序中位于当前有效段落之前
        else {
          const pos = anchorEl.compareDocumentPosition(el);
          if ((pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
            isMatch = true;
          }
        }

        if (isMatch) {
          toc.startIndex = currentGlobalIndex;
          anchorElMap.delete(toc);
        }
      }

      // 6. 将清洗验证后的有效段落 push 进最终数组
      allParagraphs.push(paragraphHtml);
    }

    // 【核心要求 3】：锚点丢失兜底
    // 如果 TOC 项带有 targetAnchor，但在遍历整个 DOM 树时都没能匹配到对应的 id 元素，
    // 兜底将其 startIndex 设置为该文件第一个有效段落的索引，绝不能让它空置
    if (chapterFirstValidIndex !== null) {
      for (const toc of currentChapterTocs) {
        if (toc.startIndex === -1) {
          toc.startIndex = chapterFirstValidIndex;
        }
      }
    }
  }

  if (allParagraphs.length === 0) {
    throw new Error("在 EPUB 中未提取到有效文本段落或排版内容");
  }

  // 7. 全书遍历结束后的平滑兜底校验：确保每个目录项的 startIndex 均有效且单调不减
  let lastValidIndex = 0;
  for (let i = 0; i < rawTocList.length; i++) {
    const item = rawTocList[i];
    if (item.startIndex === -1) {
      item.startIndex = lastValidIndex;
    } else {
      if (item.startIndex < lastValidIndex) {
        item.startIndex = lastValidIndex;
      } else {
        lastValidIndex = item.startIndex;
      }
    }
  }

  // 8. 计算每个目录项的段落跨度 (paragraphsCount)
  for (let i = 0; i < rawTocList.length; i++) {
    const current = rawTocList[i];
    const nextStartIndex =
      i < rawTocList.length - 1 ? rawTocList[i + 1].startIndex : allParagraphs.length;
    current.paragraphsCount = Math.max(0, nextStartIndex - current.startIndex);
  }

  const finalToc: TocItem[] = rawTocList.map((t) => ({
    id: t.id,
    title: t.title,
    startIndex: t.startIndex,
    paragraphsCount: t.paragraphsCount ?? 0,
  }));

  return {
    title: cleanTitle,
    creator,
    paragraphs: allParagraphs,
    toc: finalToc,
  };
}

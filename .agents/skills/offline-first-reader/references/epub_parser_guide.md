# 纯前端 EPUB 解析与图片离线化指南 (Client-side EPUB Parser Guide)

本参考文档规定了在浏览器纯前端环境中，使用 `JSZip` 与 `DOMParser` 解析 EPUB 电子书、按章节拓扑排序，并将插图转码为 Base64 永久本地离线化的工程方案。

---

## 1. EPUB 容器标准解包流程

EPUB 本质上是一个遵循 OCF 规范的 ZIP 压缩包：

```
[ 用户选择 .epub 文件 ] ──> JSZip.loadAsync(file)
                                 │
                                 ▼
                     [ 读取 META-INF/container.xml ] ──> 获取 OPF 根文件路径 (如 OEBPS/content.opf)
                                 │
                                 ▼
                     [ 解析 content.opf ]
                       ├── <manifest> 资源清单 (章节 xhtml、图片 png/jpg)
                       └── <spine> 阅读顺序拓扑列表
                                 │
                                 ▼
                     [ 顺序读取章节并抽取图片 ]
```

---

## 2. 图片离线化转码核心实现

为了保证断网离线后插图依旧正常渲染，必须将内部相对路径图片转码为 Base64：

```typescript
// 1. 预先读取并将所有图片资源转为 Base64
const imageMap: Record<string, string> = {};

for (const [relativePath, fileObj] of Object.entries(zip.files)) {
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(relativePath)) {
    const base64Data = await fileObj.async("base64");
    const mime = relativePath.endsWith(".svg") ? "image/svg+xml" : "image/jpeg";
    imageMap[relativePath] = `data:${mime};base64,${base64Data}`;
  }
}

// 2. 在解析章节 XHTML 时，将 <img> 与 <image> 的 src/xlink:href 替换为 Base64
const parser = new DOMParser();
const doc = parser.parseFromString(chapterHtml, "application/xhtml+xml");

doc.querySelectorAll("img").forEach(img => {
  const rawSrc = img.getAttribute("src");
  if (rawSrc) {
    // 根据相对路径解析到 imageMap 中匹配的 Base64 字符串
    const resolvedPath = resolvePath(rawSrc);
    if (imageMap[resolvedPath]) {
      img.setAttribute("src", imageMap[resolvedPath]);
    }
  }
});
```

---

## 3. 段落切片与纯文本提取

- 将清洗后的 DOM 节点按 `<p>`, `<h1>`~`<h6>`, `<div>` 抽取为独立的 HTML 字符串；
- 过滤无关内联脚本、样式与危险标签；
- 最终产出干净的 `paragraphs: string[]` 数组，完美无缝对接虚拟分页器 `VirtualPager` 渲染。

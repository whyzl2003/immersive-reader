"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useReaderStore } from "@/src/store/useReaderStore";
import { parseEpub } from "@/src/utils/epubParser";
import { FolderUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface BookImporterProps {
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost" | "link";
  children?: React.ReactNode;
}

export function BookImporter({
  className = "",
  size = "sm",
  variant = "outline",
  children,
}: BookImporterProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isParsing, setIsParsing] = React.useState(false);
  const { importBookToShelf } = useReaderStore();

  // 触发本地文件选择
  const handleTriggerUpload = () => {
    if (isParsing) return;
    fileInputRef.current?.click();
  };

  // 读取并解析本地 TXT 或 EPUB 文件
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const isEpub = lowerName.endsWith(".epub");
    const isTxt = lowerName.endsWith(".txt");

    if (!isEpub && !isTxt) {
      toast.error("仅支持导入 .txt 或 .epub 格式的电子书文件");
      return;
    }

    setIsParsing(true);

    try {
      // 1. 处理 EPUB 格式电子书
      if (isEpub) {
        const loadingToast = toast.loading("正在解析 EPUB 电子书并提取图文排版...");
        const reader = new FileReader();

        reader.onload = async (event) => {
          try {
            const buffer = event.target?.result as ArrayBuffer;
            if (!buffer) {
              toast.dismiss(loadingToast);
              toast.error("读取 EPUB 文件内容为空");
              setIsParsing(false);
              return;
            }

            const fallbackTitle = file.name.replace(/\.[^/.]+$/, "").trim() || "未命名电子书";
            const parsedBook = await parseEpub(buffer, fallbackTitle);

            // 存入 IndexedDB 私人书架并自动切书（标注 epub 格式与精准章节目录）
            importBookToShelf(parsedBook.title, parsedBook.paragraphs, "epub", parsedBook.toc);

            const tocDesc = parsedBook.toc && parsedBook.toc.length > 0 ? `，${parsedBook.toc.length} 个结构化章节目录` : "";
            toast.dismiss(loadingToast);
            toast.success(`已将《${parsedBook.title}》存入私人书架并开启阅读`, {
              description: `共提取出 ${parsedBook.paragraphs.length} 个结构化段落/插画${tocDesc}，已持久化至 IndexedDB。`,
              duration: 4000,
            });
          } catch (err: any) {
            console.error("解析 EPUB 失败:", err);
            toast.dismiss(loadingToast);
            toast.error("解析 EPUB 文件失败", {
              description: err?.message || "请检查该 EPUB 文件规范后重试",
            });
          } finally {
            setIsParsing(false);
            if (fileInputRef.current) {
              fileInputRef.current.value = "";
            }
          }
        };

        reader.onerror = () => {
          toast.dismiss(loadingToast);
          toast.error("读取本地 EPUB 文件失败，请重试");
          setIsParsing(false);
        };

        reader.readAsArrayBuffer(file);
        return;
      }

      // 2. 处理 TXT 格式纯文本文档
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const rawText = event.target?.result as string;
          if (!rawText) {
            toast.error("读取文件内容为空");
            setIsParsing(false);
            return;
          }

          // 数据清洗：按换行符切分段落，过滤掉纯空白段落
          const paragraphs = rawText
            .split(/\n+/)
            .map((p) => p.trim())
            .filter((p) => p.length > 0);

          if (paragraphs.length === 0) {
            toast.error("未在文件中识别到有效文本段落");
            setIsParsing(false);
            return;
          }

          const bookTitle = file.name.replace(/\.[^/.]+$/, "").trim() || "未命名书籍";

          // 存入 IndexedDB 私人书架并自动切换至该书（标注 txt 格式）
          importBookToShelf(bookTitle, paragraphs, "txt");

          toast.success(`已将《${bookTitle}》存入私人书架并开启阅读`, {
            description: `共解析出 ${paragraphs.length} 个段落，数据已长久保存至本地 IndexedDB。`,
          });
        } finally {
          setIsParsing(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
      };

      reader.onerror = () => {
        toast.error("读取本地 TXT 文件失败，请检查文件权限后重试");
        setIsParsing(false);
      };

      reader.readAsText(file, "utf-8");
    } catch (globalErr: any) {
      toast.error("导入书籍异常: " + (globalErr?.message || "未知错误"));
      setIsParsing(false);
    }
  };

  return (
    <div className={`inline-flex items-center ${className}`}>
      {/* 隐藏的本地文件输入框，支持 .txt 和 .epub */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.epub"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 导入书籍按钮 */}
      <Button
        variant={variant}
        size={size}
        onClick={handleTriggerUpload}
        disabled={isParsing}
        className="gap-1.5 font-serif text-xs border-border bg-card/80 hover:bg-accent shadow-xs"
        title="选择本地 .txt 或 .epub 电子书导入私人书架"
      >
        {isParsing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
        ) : (
          <FolderUp className="w-3.5 h-3.5 text-primary" />
        )}
        {children || <span>{isParsing ? "解析中..." : "导入书籍"}</span>}
      </Button>
    </div>
  );
}


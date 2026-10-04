"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useReaderStore } from "@/src/store/useReaderStore";
import { FolderUp, RotateCcw, FileText } from "lucide-react";
import { toast } from "sonner";

interface BookImporterProps {
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

export function BookImporter({ className = "", size = "sm" }: BookImporterProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { customBook, setCustomBook, clearCustomBook } = useReaderStore();

  // 触发本地文件选择
  const handleTriggerUpload = () => {
    fileInputRef.current?.click();
  };

  // 读取并解析本地 TXT 文本
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".txt")) {
      toast.error("请选择 .txt 格式的纯文本文档");
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      const rawText = event.target?.result as string;
      if (!rawText) {
        toast.error("读取文件内容为空");
        return;
      }

      // 数据清洗：按换行符切分段落，过滤掉纯空白段落
      const paragraphs = rawText
        .split(/\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      if (paragraphs.length === 0) {
        toast.error("未在文件中识别到有效文本段落");
        return;
      }

      const bookTitle = file.name.replace(/\.[^/.]+$/, "");
      setCustomBook(paragraphs, bookTitle);

      toast.success(`已成功导入《${bookTitle}》`, {
        description: `共解析出 ${paragraphs.length} 个段落，已切换为通用阅读模式。`,
      });

      // 重置 input 以便允许再次导入同名文件
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };

    reader.onerror = () => {
      toast.error("读取本地 TXT 文件失败，请检查文件权限后重试");
    };

    reader.readAsText(file, "utf-8");
  };

  // 恢复默认书籍
  const handleRestoreDefault = () => {
    clearCustomBook();
    toast.info("已恢复默认典藏书籍《A Little History of the World》");
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* 隐藏的本地文件输入框 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 导入本地 TXT 按钮 */}
      <Button
        variant="outline"
        size={size}
        onClick={handleTriggerUpload}
        className="gap-1.5 font-serif text-xs border-border bg-card/80 hover:bg-accent shadow-xs"
        title="选择本地 .txt 文件导入阅读"
      >
        <FolderUp className="w-3.5 h-3.5 text-primary" />
        <span>导入本地 TXT</span>
      </Button>

      {/* 恢复默认书籍按钮（仅在 customBook 不为 null 时显示） */}
      {customBook !== null && (
        <Button
          variant="ghost"
          size={size}
          onClick={handleRestoreDefault}
          className="gap-1.5 font-serif text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50"
          title="退出当前导入文本，恢复默认世界小史"
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
          <span>恢复默认书籍</span>
        </Button>
      )}
    </div>
  );
}

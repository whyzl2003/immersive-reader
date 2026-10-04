"use client";

import * as React from "react";
import { useReaderStore, NoteItem } from "@/src/store/useReaderStore";
import { BOOK_TITLE, BOOK_ID } from "@/src/data/bookData";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Download, Trash2, Plus, FileText, Calendar, BookOpen, Clock } from "lucide-react";
import { toast } from "sonner";

export function NotesView() {
  const { notesList, removeNote, addNote, clearAllNotes, currentPage, pageSize } = useReaderStore();
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [newContext, setNewContext] = React.useState("");
  const [newNoteText, setNewNoteText] = React.useState("");

  // 完美复刻 Markdown 导出逻辑（修复丢失字母的 bug，采用纯净 Blob 下载）
  const handleExportMarkdown = () => {
    if (notesList.length === 0) {
      toast.info("暂无读书随笔笔记可导出");
      return;
    }

    const exportTime = new Date().toLocaleString("zh-CN");
    const LF = "\n";
    const lines: string[] = [];

    lines.push(`# 《${BOOK_TITLE}》读书随笔笔记`);
    lines.push("");
    lines.push(`> 📅 导出时间：${exportTime}`);
    lines.push(`> 📊 笔记总计：${notesList.length} 条`);
    lines.push("");
    lines.push("---");
    lines.push("");

    notesList.forEach((item, idx) => {
      const pageNum = item.page || 1;
      const paraNum = (item.paragraphIndex ?? 0) + 1;
      const time = item.updatedAt || item.createdAt || "";

      lines.push(`### ${idx + 1}. 第 ${pageNum} 页 · 段落 #${paraNum}`);
      lines.push("");
      lines.push(`*记录时间：${time}*`);
      lines.push("");
      if (item.context) {
        lines.push(`> ${item.context.trim()}`);
        lines.push("");
      }
      lines.push(`- **💡 读书随笔**：`);
      const noteLines = item.note.split(LF);
      for (let n = 0; n < noteLines.length; n++) {
        lines.push(`  ${noteLines[n]}`);
      }
      lines.push("");
      lines.push("---");
      lines.push("");
    });

    const md = lines.join(LF);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const filename = `${BOOK_ID}_Notes_${Date.now()}.md`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`导出成功！已下载 ${notesList.length} 条笔记 (${filename})`);
  };

  // 新增随笔笔记
  const handleCreateNote = () => {
    if (!newNoteText.trim()) {
      toast.error("请输入笔记内容");
      return;
    }

    addNote({
      paragraphIndex: currentPage * pageSize,
      page: currentPage + 1,
      context: newContext.trim() || `第 ${currentPage + 1} 页所选段落`,
      note: newNoteText.trim(),
    });

    setNewContext("");
    setNewNoteText("");
    setIsAddOpen(false);
    toast.success("已成功保存一条读书随笔！");
  };

  // 删除单条笔记
  const handleDeleteNote = (item: NoteItem) => {
    removeNote(item.id);
    toast.success("已删除该条随笔笔记");
  };

  return (
    <div className="space-y-6">
      {/* 顶部操作与统计工具栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📒</span>
            <h2 className="font-serif font-bold text-lg text-foreground">我的读书随笔</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-mono font-medium">
              共 {notesList.length} 条
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 font-serif">
            记录阅读灵感、哲思感悟，支持无缝导出为标准 Markdown 文档
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* 新增笔记弹窗 */}
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 border-border font-serif">
                <Plus className="w-3.5 h-3.5 text-primary" />
                <span>记随笔</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-popover text-popover-foreground border-border">
              <DialogHeader>
                <DialogTitle className="font-serif">添加读书随笔</DialogTitle>
                <DialogDescription>
                  记录您对当前章节或段落的思考心得。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2 text-sm">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">引用的原文摘要（可选）</label>
                  <Input
                    placeholder="输入或粘贴引用的书籍原句..."
                    value={newContext}
                    onChange={(e) => setNewContext(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">您的思考心得 / 随笔正文</label>
                  <Textarea
                    placeholder="写下深刻启发或疑问..."
                    rows={4}
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>取消</Button>
                <Button onClick={handleCreateNote}>保存笔记</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 一键清空所有笔记按钮 */}
          <Button
            variant="outline"
            size="sm"
            disabled={notesList.length === 0}
            onClick={() => {
              if (window.confirm("确定要清空所有笔记吗？清空前请确保您已点击导出备份。")) {
                clearAllNotes();
                toast.info("已清空所有读书笔记");
              }
            }}
            className="gap-1.5 font-serif text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>一键清空</span>
          </Button>

          {/* 导出 Markdown 按钮 */}
          <Button
            size="sm"
            onClick={handleExportMarkdown}
            className="gap-1.5 font-serif bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>导出为 Markdown</span>
          </Button>
        </div>
      </div>

      {/* 笔记卡片流列表 */}
      {notesList.length === 0 ? (
        <Card className="border-border bg-card/60 p-12 text-center">
          <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-serif font-medium text-base text-foreground">暂无读书随笔</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 font-serif">
            在阅读过程中点击右上角“记随笔”，即可将您的阅读思考长久留存于此。
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {notesList.map((item, idx) => (
            <Card
              key={item.id}
              className="border-border bg-card shadow-xs transition-all hover:border-primary/40 hover:shadow-sm"
            >
              <CardHeader className="py-3 px-5 border-b border-border/40 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-primary">
                    #{idx + 1}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    第 {item.page} 页 · 段落 #{(item.paragraphIndex ?? 0) + 1}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
                    <Clock className="w-3 h-3" />
                    <span>{item.updatedAt || item.createdAt}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteNote(item)}
                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="删除笔记"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-5 space-y-3">
                {/* 原文引用摘要 */}
                {item.context && (
                  <div className="bg-muted/40 p-3 rounded-lg border-l-2 border-primary/60 text-xs font-serif italic text-muted-foreground leading-relaxed">
                    “{item.context.trim()}”
                  </div>
                )}

                {/* 笔记正文 */}
                <div className="text-sm font-sans leading-relaxed text-foreground whitespace-pre-wrap pl-0.5">
                  {item.note}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

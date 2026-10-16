"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useReaderStore } from "@/src/store/useReaderStore";
import { Cloud, CloudCheck, RefreshCw, Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export function SyncEmailModal() {
  const [open, setOpen] = React.useState(false);
  const {
    userEmail,
    setUserEmail,
    isSyncing,
    lastSyncTime,
    currentBookId,
    pullReadingProgressFromCloud,
    syncVocabularyWithCloud,
    syncBooksWithCloud,
    syncNotesWithCloud,
  } = useReaderStore();

  const [inputEmail, setInputEmail] = React.useState("");
  const [localSyncing, setLocalSyncing] = React.useState(false);

  // 当弹窗打开时，自动填充当前已绑定的邮箱
  React.useEffect(() => {
    if (open) {
      setInputEmail(userEmail || "");
    }
  }, [open, userEmail]);

  // 绑定或更新邮箱
  const handleSaveEmail = () => {
    const trimmed = inputEmail.trim().toLowerCase();
    if (!trimmed) {
      toast.error("请输入有效的邮箱地址");
      return;
    }
    // 基础邮箱格式校验
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      toast.error("邮箱格式不正确，请重新输入");
      return;
    }

    setUserEmail(trimmed);
    toast.success("同步邮箱已绑定", {
      description: `电脑与手机填写 ${trimmed} 即可保持数据无缝同步`,
    });

    // 绑定后立即自动触发一次初始双向同步
    handleManualSync(trimmed);
  };

  // 手动解绑
  const handleUnbind = () => {
    if (window.confirm("确定要解绑当前同步邮箱吗？本地阅读进度和生词仍会保留在浏览器中。")) {
      setUserEmail("");
      setInputEmail("");
      toast.info("已解绑云端同步邮箱");
    }
  };

  // 触发手动双向同步（一次性并发执行全量事务）
  const handleManualSync = async (targetEmail?: string) => {
    const email = (targetEmail || userEmail || "").trim().toLowerCase();
    if (!email) {
      toast.error("请先输入并保存同步邮箱");
      return;
    }

    setLocalSyncing(true);
    try {
      // 并发执行全量事务：
      // a. 生词本全量对齐 (vocabulary)
      // b. 本地书籍自动补推 + 云端缺失书籍静默拉取 (user_books)
      // c. 读书笔记双向合并 (notes)
      // d. 当前阅读进度时间戳仲裁 (reading_progress)
      const [vocabResult, booksResult, notesResult] = await Promise.all([
        syncVocabularyWithCloud(),
        syncBooksWithCloud(),
        syncNotesWithCloud(),
        pullReadingProgressFromCloud(currentBookId, false),
      ]);

      const details: string[] = [];
      const bookDetail =
        booksResult.addedCount > 0
          ? `+${booksResult.addedCount}本`
          : booksResult.pushedCount > 0
          ? `推${booksResult.pushedCount}本`
          : "书架最新";
      details.push(`📚 ${bookDetail}`);

      const noteDetail =
        notesResult.addedToLocal > 0
          ? `+${notesResult.addedToLocal}条`
          : notesResult.pushedToCloud > 0
          ? `推${notesResult.pushedToCloud}条`
          : "笔记最新";
      details.push(`📝 ${noteDetail}`);

      const vocabDetail =
        vocabResult.addedToLocal > 0
          ? `+${vocabResult.addedToLocal}词`
          : vocabResult.pushedToCloud > 0
          ? `推${vocabResult.pushedToCloud}词`
          : "生词最新";
      details.push(`📓 ${vocabDetail}`);

      details.push("📍 进度已对齐");

      toast.success("☁️ 云端已全面对齐：书籍、笔记、生词与进度", {
        description: details.join(" | "),
      });
    } catch (err: any) {
      console.error("云端同步失败:", err);
      toast.error("同步失败，请检查网络连接后重试", {
        description: err?.message || "网络请求超时或鉴权失败",
      });
    } finally {
      setLocalSyncing(false);
    }
  };

  // 格式化上次同步时间
  const formatLastSync = (time: number | null) => {
    if (!time) return "尚未同步";
    const date = new Date(time);
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const isBound = Boolean(userEmail && userEmail.trim());
  const busy = isSyncing || localSyncing;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 px-2.5 sm:px-3 text-xs font-serif transition-all duration-200 gap-1.5 border-border ${
            isBound
              ? "bg-amber-500/10 text-amber-900 dark:text-amber-200 border-amber-300/40 hover:bg-amber-500/20"
              : "bg-muted/40 text-muted-foreground hover:text-foreground"
          }`}
          title={isBound ? `已关联同步邮箱: ${userEmail}` : "点击绑定云端同步邮箱"}
        >
          {busy ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
          ) : isBound ? (
            <CloudCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Cloud className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span className="hidden sm:inline">
            {busy ? "同步中..." : isBound ? "云端同步" : "绑定同步"}
          </span>
          {isBound && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md bg-card border-border text-foreground">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-300/30">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="font-serif text-lg tracking-wide">
                Supabase 云端跨端同步
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                电脑与手机填写同一个邮箱，即可实现书籍、笔记、生词与进度双向无缝漫游
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 当前绑定状态卡片 */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                当前关联状态
              </span>
              {isBound ? (
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[11px] px-2 py-0.5"
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" /> 已绑定
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[11px] px-2 py-0.5"
                >
                  <AlertCircle className="w-3 h-3 mr-1" /> 未绑定
                </Badge>
              )}
            </div>

            <div className="text-sm font-medium text-foreground truncate">
              {isBound ? userEmail : "尚未关联同步邮箱（离线单机模式）"}
            </div>

            {isBound && (
              <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1 border-t border-border/50">
                <span>上次同步时间:</span>
                <span className="font-mono">{formatLastSync(lastSyncTime)}</span>
              </div>
            )}
          </div>

          {/* 邮箱输入与关联区域 */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground/80">
              {isBound ? "更换或重新绑定邮箱" : "输入同步邮箱"}
            </label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="例如: yourname@example.com"
                value={inputEmail}
                onChange={(e) => setInputEmail(e.target.value)}
                className="text-xs h-9"
              />
              <Button
                size="sm"
                onClick={handleSaveEmail}
                disabled={busy || !inputEmail.trim()}
                className="h-9 px-4 text-xs font-serif shrink-0 bg-amber-700 hover:bg-amber-800 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
              >
                保存关联
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              💡 提示：无需注册密码，直接输入您的常用邮箱作为数据命名空间。在其他设备上输入相同邮箱即可自动汇聚生词与进度。
            </p>
          </div>

          {/* 快捷操作区 */}
          {isBound && (
            <div className="pt-2 flex items-center justify-between gap-2 border-t border-border">
              <button
                onClick={handleUnbind}
                className="text-xs text-muted-foreground hover:text-red-500 transition-colors underline-offset-4 hover:underline"
              >
                解除邮箱绑定
              </button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleManualSync()}
                disabled={busy}
                className="text-xs font-serif gap-1.5 h-8 border-border hover:bg-muted"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${busy ? "animate-spin text-amber-600" : ""}`}
                />
                {busy ? "正在双向同步..." : "立即双向同步"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

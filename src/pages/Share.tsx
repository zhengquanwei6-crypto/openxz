import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Share2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/ui/Toast";

interface Character {
  id: string;
  name: string;
  avatar: string;
  shortBio: string;
  tags: string[];
  themeColor: string;
}

export function SharePage() {
  const { characterId } = useParams<{ characterId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [character, setCharacter] = useState<Character | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!characterId) return;
    api<Character>(`/api/characters/${characterId}`, { token }).then(setCharacter);
  }, [characterId, token]);

  const generatePoster = () => {
    const canvas = canvasRef.current;
    if (!canvas || !character) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw poster background
    canvas.width = 375;
    canvas.height = 600;
    
    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 600);
    gradient.addColorStop(0, "#0f172a");
    gradient.addColorStop(1, "#1e293b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 375, 600);

    // Brand
    ctx.fillStyle = "#0d9488";
    ctx.font = "bold 14px system-ui";
    ctx.fillText("Persona Chat", 24, 40);

    // Character name
    ctx.fillStyle = "#f1f5f9";
    ctx.font = "bold 28px system-ui";
    ctx.fillText(character.name, 24, 200);

    // Bio
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px system-ui";
    const words = character.shortBio.split("");
    let line = "";
    let y = 235;
    for (const char of words) {
      if (ctx.measureText(line + char).width > 327) {
        ctx.fillText(line, 24, y);
        line = char;
        y += 22;
      } else {
        line += char;
      }
    }
    ctx.fillText(line, 24, y);

    // Tags
    ctx.fillStyle = "#475569";
    ctx.font = "12px system-ui";
    ctx.fillText(character.tags.join(" · "), 24, y + 40);

    // CTA
    ctx.fillStyle = "#0d9488";
    ctx.beginPath();
    ctx.roundRect(24, 500, 327, 48, 12);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("来 Persona Chat 和 TA 聊天", 187, 530);
    ctx.textAlign = "left";

    // URL
    ctx.fillStyle = "#64748b";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(window.location.origin + "/character/" + character.id, 187, 575);
  };

  useEffect(() => {
    if (character) generatePoster();
  }, [character]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `persona-${character?.name || "share"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast("海报已保存", "success");
  };

  const handleShare = async () => {
    if (navigator.share && character) {
      try {
        await navigator.share({
          title: `${character.name} - Persona Chat`,
          text: character.shortBio,
          url: `${window.location.origin}/character/${character.id}`,
        });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(`${window.location.origin}/character/${character?.id}`);
      toast("链接已复制", "success");
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 pt-[max(12px,var(--sat))]">
        <button onClick={() => navigate(-1)} className="p-1 text-slate-400 hover:text-slate-200"><ArrowLeft className="w-5 h-5" /></button>
        <h2 className="text-base font-semibold text-slate-100">分享角色</h2>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col items-center py-6 px-4">
        <canvas ref={canvasRef} className="rounded-xl shadow-2xl max-w-full" style={{ width: 300, height: 480 }} />
        
        <div className="flex gap-3 mt-6">
          <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-sm hover:bg-slate-700">
            <Download className="w-4 h-4" /> 保存海报
          </button>
          <button onClick={handleShare} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm hover:bg-teal-500">
            <Share2 className="w-4 h-4" /> 分享
          </button>
        </div>
      </div>
    </div>
  );
}

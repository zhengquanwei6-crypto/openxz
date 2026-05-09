import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

interface Persona {
  id: string;
  nickname: string;
  preferredName: string;
  gender: string;
  ageRange: string;
  interests: string[];
  chatPreference: string;
}

export function PersonaEditorPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<Persona>("/api/persona", { token })
      .then(setPersona)
      .finally(() => setLoading(false));
  }, [token]);

  const handleSave = async () => {
    if (!persona) return;
    setSaving(true);
    try {
      await api("/api/persona", { method: "PUT", body: persona, token });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const update = (key: keyof Persona, value: string | string[]) => {
    setPersona((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  if (loading || !persona) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 pt-[max(12px,var(--sat))]">
        <button onClick={() => navigate(-1)} className="p-1 text-slate-400 hover:text-slate-200">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-semibold text-slate-100 flex-1">我的人设</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          {saved ? "已保存" : saving ? "保存中" : "保存"}
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <FormField label="昵称" hint="显示在聊天列表中的名字">
          <input
            value={persona.nickname}
            onChange={(e) => update("nickname", e.target.value)}
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
          />
        </FormField>

        <FormField label="希望被称呼为" hint="角色会用这个称呼来叫你">
          <input
            value={persona.preferredName}
            onChange={(e) => update("preferredName", e.target.value)}
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
          />
        </FormField>

        <FormField label="性别">
          <div className="flex gap-2">
            {["不限定", "男", "女", "其他"].map((g) => (
              <button
                key={g}
                onClick={() => update("gender", g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  persona.gender === g
                    ? "bg-teal-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="年龄段">
          <div className="flex flex-wrap gap-2">
            {["18-24", "25-34", "35-44", "45+"].map((age) => (
              <button
                key={age}
                onClick={() => update("ageRange", age)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  persona.ageRange === age
                    ? "bg-teal-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {age}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="兴趣爱好" hint="用逗号分隔">
          <input
            value={persona.interests.join(", ")}
            onChange={(e) => update("interests", e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean))}
            placeholder="科幻电影, 音乐, 旅行..."
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
          />
        </FormField>

        <FormField label="聊天偏好" hint="你希望角色怎么和你说话">
          <textarea
            value={persona.chatPreference}
            onChange={(e) => update("chatPreference", e.target.value)}
            rows={3}
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none"
          />
        </FormField>
      </div>
    </div>
  );
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-200 mb-1 block">{label}</label>
      {hint && <p className="text-[11px] text-slate-500 mb-2">{hint}</p>}
      {children}
    </div>
  );
}

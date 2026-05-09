import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export function PrivacyPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full bg-slate-950">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 pt-[max(12px,var(--sat))]">
        <button onClick={() => navigate(-1)} className="p-1 text-slate-400 hover:text-slate-200">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-semibold text-slate-100">隐私政策</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-6 prose prose-sm prose-invert max-w-none">
        <h2>隐私政策</h2>
        <p className="text-slate-400 text-xs">最后更新：2026 年 5 月</p>
        <h3>1. 我们收集的信息</h3>
        <p>我们收集您主动提供的信息：昵称、聊天偏好、对话内容和保存的记忆。我们不要求您提供真实姓名、手机号或身份证号。</p>
        <h3>2. 信息的使用</h3>
        <p>您的对话内容仅用于生成 AI 角色回复，不会被用于训练公开模型。保存的"记忆"仅影响您与对应角色的后续对话。</p>
        <h3>3. 信息的存储</h3>
        <p>数据存储于中国大陆境内服务器，采用 AES-256 加密存储敏感字段。我们定期备份并在 30 天后自动删除备份。</p>
        <h3>4. 信息的共享</h3>
        <p>我们不会将您的个人信息出售或共享给第三方，除非法律要求或您明确授权。AI 生成所需的请求会通过加密通道发送至模型服务方，不包含您的账户信息。</p>
        <h3>5. 您的权利</h3>
        <p>您可以随时：查看/导出您的所有数据；删除单条记忆或整个账户；撤回对数据处理的同意。</p>
        <h3>6. 未成年人保护</h3>
        <p>本服务面向 18 周岁及以上用户。如果我们发现未成年人注册，将主动删除相关数据。</p>
        <h3>7. 联系我们</h3>
        <p>如有隐私相关问题，请通过应用内"反馈"功能联系我们。</p>
      </div>
    </div>
  );
}

export function TermsPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full bg-slate-950">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 pt-[max(12px,var(--sat))]">
        <button onClick={() => navigate(-1)} className="p-1 text-slate-400 hover:text-slate-200">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-semibold text-slate-100">用户协议</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-6 prose prose-sm prose-invert max-w-none">
        <h2>用户服务协议</h2>
        <p className="text-slate-400 text-xs">最后更新：2026 年 5 月</p>
        <h3>1. 服务说明</h3>
        <p>Persona Chat 是一款 AI 虚拟角色聊天产品。角色的回复由 AI 模型生成，不代表真实人物的观点或建议。</p>
        <h3>2. 用户行为规范</h3>
        <p>您同意不使用本服务：发布违法信息；骚扰、欺凌他人；生成或传播未成年人不宜内容；尝试破解系统或滥用 API。</p>
        <h3>3. AI 生成内容声明</h3>
        <p>AI 角色的回复仅供娱乐和陪伴，不构成专业建议（包括但不限于医疗、法律、金融建议）。如需专业帮助，请咨询相关专业人士。</p>
        <h3>4. 知识产权</h3>
        <p>您拥有您输入内容的权利。AI 生成的回复内容在法律允许的范围内，您可以自由使用。平台保留角色设计和系统功能的知识产权。</p>
        <h3>5. 付费服务</h3>
        <p>免费版有每日使用限额。订阅服务按月/年计费，可随时取消。取消后当前周期内仍可使用付费功能，周期结束后自动降级为免费版。</p>
        <h3>6. 服务变更与终止</h3>
        <p>我们保留修改或终止服务的权利，会提前 7 天通知。账户删除后数据将在 30 天内彻底清除。</p>
        <h3>7. 免责声明</h3>
        <p>本服务按"原样"提供，不保证不间断或无错误。对于因使用本服务产生的间接损失，我们不承担责任。</p>
      </div>
    </div>
  );
}

import { motion } from "motion/react";
import { Heart } from "lucide-react";
import { clsx } from "clsx";

interface Character {
  id: string;
  name: string;
  avatar: string;
  shortBio: string;
  tags: string[];
  isFavorite: boolean;
  onlineText?: string;
  themeColor?: string;
}

interface CharacterCardProps {
  character: Character;
  onSelect: (id: string) => void;
  onFavorite?: (id: string) => void;
}

export function CharacterCard({ character, onSelect, onFavorite }: CharacterCardProps) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={() => onSelect(character.id)}
      className="relative flex gap-3 p-3 rounded-xl bg-slate-900/50 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors"
    >
      <div className="flex-shrink-0 w-14 h-14 rounded-full overflow-hidden bg-slate-800 ring-2 ring-slate-700">
        {character.avatar ? (
          <img src={character.avatar} alt={character.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg font-medium text-slate-400">
            {character.name[0]}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-100 truncate">{character.name}</h3>
          {character.onlineText && (
            <span className="text-[10px] text-teal-400 bg-teal-950 px-1.5 py-0.5 rounded-full">
              {character.onlineText}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{character.shortBio}</p>
        <div className="flex gap-1 mt-1.5">
          {character.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {onFavorite && (
        <button
          onClick={(e) => { e.stopPropagation(); onFavorite(character.id); }}
          className="absolute top-3 right-3 p-1"
        >
          <Heart
            className={clsx(
              "w-4 h-4 transition-colors",
              character.isFavorite ? "fill-red-400 text-red-400" : "text-slate-600"
            )}
          />
        </button>
      )}
    </motion.div>
  );
}

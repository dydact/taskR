import { useTheme } from "../components/ThemeContext";
import { Button } from "../components/ui/button";
import { Sparkles } from "lucide-react";

type PlaceholderViewProps = {
  title: string;
  description: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
};

export const PlaceholderView: React.FC<PlaceholderViewProps> = ({
  title,
  description,
  ctaLabel,
  onCtaClick
}) => {
  const { colors } = useTheme();

  return (
    <section className={`${colors.cardBackground} h-full flex items-center justify-center`}>
      <div className="max-w-lg text-center space-y-4 p-10">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/30 flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-violet-300" />
        </div>
        <h2 className={`text-2xl font-semibold ${colors.text}`}>{title}</h2>
        <p className={`${colors.textSecondary} text-sm leading-relaxed`}>
          {description}
        </p>
        {ctaLabel && onCtaClick && (
          <Button onClick={onCtaClick} className="mt-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white">
            {ctaLabel}
          </Button>
        )}
      </div>
    </section>
  );
};

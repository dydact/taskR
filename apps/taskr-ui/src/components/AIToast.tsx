import { Sparkles, Check, X } from 'lucide-react';
import { Button } from './ui/button';

export function AIToast({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-gradient-to-r from-violet-600/95 to-blue-600/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-4 min-w-[400px]">
        <div className="flex items-start gap-3">
          {/* AI Icon */}
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>

          {/* Content */}
          <div className="flex-1">
            <h4 className="text-white mb-1">Automation Ready</h4>
            <p className="text-white/80 text-[13px] leading-relaxed">
              I noticed you frequently update task status. Would you like me to create an automation?
            </p>
          </div>

          {/* Close Button */}
          <Button
            size="icon"
            variant="ghost"
            onClick={onDismiss}
            className="w-6 h-6 text-white/70 hover:text-white hover:bg-white/10 rounded-lg flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-3 ml-13">
          <Button 
            size="sm"
            onClick={onDismiss}
            className="flex-1 bg-white/20 hover:bg-white/30 text-white rounded-xl h-8"
          >
            <Check className="w-3.5 h-3.5 mr-1" />
            Accept
          </Button>
          <Button 
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            className="flex-1 text-white/70 hover:text-white hover:bg-white/10 rounded-xl h-8"
          >
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}

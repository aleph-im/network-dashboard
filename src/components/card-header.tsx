import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@aleph-front/ds/tooltip";

type CardHeaderProps = {
  title: string;
  info: string;
};

export function CardHeader({ title, info }: CardHeaderProps) {
  return (
    <div className="mb-5 flex items-center gap-2">
      <h3 className="text-2xl font-heading font-bold">{title}</h3>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex size-5 items-center justify-center rounded-full border border-muted-foreground/20 text-[10px] text-muted-foreground/60 transition-colors hover:border-muted-foreground/40 hover:text-muted-foreground"
            >
              ?
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[280px]">
            {info}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

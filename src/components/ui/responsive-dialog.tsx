"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * ResponsiveDialog: Dialog no desktop, Drawer (bottom sheet arrastável) no mobile.
 * API espelha o Dialog do shadcn — drop-in para Dialog/DialogContent/DialogHeader/etc.
 */

const MobileCtx = React.createContext<boolean>(false);

interface RootProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function ResponsiveDialog({ open, onOpenChange, children }: RootProps) {
  const isMobile = useIsMobile();
  return (
    <MobileCtx.Provider value={isMobile}>
      {isMobile ? (
        <Drawer open={open} onOpenChange={onOpenChange}>
          {children}
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          {children}
        </Dialog>
      )}
    </MobileCtx.Provider>
  );
}

export function ResponsiveDialogTrigger(props: React.ComponentProps<typeof DialogTrigger>) {
  const isMobile = React.useContext(MobileCtx);
  return isMobile ? <DrawerTrigger {...(props as any)} /> : <DialogTrigger {...props} />;
}

interface ContentProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const ResponsiveDialogContent = React.forwardRef<HTMLDivElement, ContentProps>(
  ({ className, children, ...props }, ref) => {
    const isMobile = React.useContext(MobileCtx);
    if (isMobile) {
      return (
        <DrawerContent
          ref={ref as any}
          className={cn("max-h-[92vh]", className)}
          {...(props as any)}
        >
          <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
            {children}
          </div>
        </DrawerContent>
      );
    }
    return (
      <DialogContent
        ref={ref as any}
        className={cn("max-h-[90vh] overflow-y-auto", className)}
        {...(props as any)}
      >
        {children}
      </DialogContent>
    );
  },
);
ResponsiveDialogContent.displayName = "ResponsiveDialogContent";

export function ResponsiveDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isMobile = React.useContext(MobileCtx);
  return isMobile ? (
    <DrawerHeader className={cn("px-0 pt-3 text-left", className)} {...props} />
  ) : (
    <DialogHeader className={className} {...props} />
  );
}

export function ResponsiveDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isMobile = React.useContext(MobileCtx);
  return isMobile ? (
    <DrawerFooter className={cn("px-0 pt-3", className)} {...props} />
  ) : (
    <DialogFooter className={className} {...props} />
  );
}

export function ResponsiveDialogTitle(props: React.ComponentProps<typeof DialogTitle>) {
  const isMobile = React.useContext(MobileCtx);
  return isMobile ? <DrawerTitle {...(props as any)} /> : <DialogTitle {...props} />;
}

export function ResponsiveDialogDescription(props: React.ComponentProps<typeof DialogDescription>) {
  const isMobile = React.useContext(MobileCtx);
  return isMobile ? <DrawerDescription {...(props as any)} /> : <DialogDescription {...props} />;
}

export function ResponsiveDialogClose(props: React.ComponentProps<typeof DrawerClose>) {
  const isMobile = React.useContext(MobileCtx);
  // DialogClose has same shape — but we use DrawerClose only when mobile
  if (isMobile) return <DrawerClose {...props} />;
  // on desktop the X already exists in DialogContent; render nothing by default
  return null;
}

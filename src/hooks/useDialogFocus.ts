import { useEffect, useRef } from "react";

export function useDialogFocus(key: string | null) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!key) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const scope = ref.current;
    if (!scope) return;
    const nodes = () =>
      Array.from(
        scope.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex='0']",
        ),
      ).filter((node) => node.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => nodes()[0]?.focus());
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = nodes();
      const index = elements.indexOf(document.activeElement as HTMLElement);
      if (
        index === -1 ||
        (!event.shiftKey && index === elements.length - 1) ||
        (event.shiftKey && index === 0)
      ) {
        event.preventDefault();
        elements[event.shiftKey ? elements.length - 1 : 0]?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", trap);
      if (previous?.isConnected) previous.focus();
    };
  }, [key]);
  return ref;
}

import { createContext } from "react";
export const ActionMenuContext = createContext<null | { close: () => void }>(null);

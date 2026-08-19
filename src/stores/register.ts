import { create } from "zustand";
import type { Register } from "../types";

interface RegisterState {
  register: Register | null;
  setRegister: (register: Register | null) => void;
}

export const useRegisterStore = create<RegisterState>((set) => ({
  register: null,
  setRegister: (register) => set({ register }),
}));

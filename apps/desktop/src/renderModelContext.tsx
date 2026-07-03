/* eslint-disable react-refresh/only-export-components -- context provider + hook pattern */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { INITIAL_RENDER_MODEL } from './initialModel';
import type { RenderModel } from './types';

const RenderModelContext = createContext<RenderModel>(INITIAL_RENDER_MODEL);

export function RenderModelProvider({ children }: { children: ReactNode }) {
  const [model, setModel] = useState<RenderModel>(INITIAL_RENDER_MODEL);

  useEffect(() => {
    if (!window.api) return;
    return window.api.onRenderModel(setModel);
  }, []);

  return <RenderModelContext.Provider value={model}>{children}</RenderModelContext.Provider>;
}

export function useRenderModel(): RenderModel {
  return useContext(RenderModelContext);
}

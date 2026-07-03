"use client";

import type { ReactNode } from "react";
import dayjs from "dayjs";
import { App, ConfigProvider, theme } from "antd";
import jaJP from "antd/locale/ja_JP";
import "dayjs/locale/ja";

dayjs.locale("ja");

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={jaJP}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#2f6fed",
          borderRadius: 8,
          colorBgLayout: "#f4f7fb",
          colorText: "#172033",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Yu Gothic', sans-serif",
        },
        components: {
          Button: {
            controlHeight: 36,
          },
          Calendar: {
            fullBg: "#ffffff",
            itemActiveBg: "#eef4ff",
          },
          Layout: {
            bodyBg: "#f4f7fb",
            siderBg: "#ffffff",
          },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}

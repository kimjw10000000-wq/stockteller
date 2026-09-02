"use client";

import Script from "next/script";
import {
  initKakaoSdk,
  KAKAO_SDK_INTEGRITY,
  KAKAO_SDK_URL,
} from "@/lib/kakao-share";

/** 공유 버튼을 누르기 전에 SDK를 올려 팝업이 클릭 제스처에서 열리게 한다. */
export function KakaoSdkLoader() {
  return (
    <Script
      src={KAKAO_SDK_URL}
      integrity={KAKAO_SDK_INTEGRITY}
      crossOrigin="anonymous"
      strategy="afterInteractive"
      onLoad={() => {
        initKakaoSdk();
      }}
    />
  );
}

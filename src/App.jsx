import { useRef, useEffect, useState } from 'react'
import './App.css'
import ThreejsModule from './Modules/ThreejsModule'
import EventsHandler from './EventsHandler'

function App() {

  const [loading, setLoading] = useState('0')
  const [isPending, setIsPending] = useState(false)
  const threeModuleRef = useRef(null)
  const containerRef = useRef(null)
  const [speakStates, setSpeakStates] = useState('idle') // connected, ready
  const isIframe = window.self !== window.top
  const bgImage = './assets/images/Gemini_Generated_Image_z36bgmz36bgmz36b.png'
  // console.log('isIframe', window.top)


  function isValidOrigin(origin) {
    if (!origin) {
      return false;
    }

    try {
      const parsed = new URL(origin);
      return Boolean(parsed.origin) && parsed.origin !== "null";
    } catch {
      return false;
    }
  }


  const getBootstrapParentOrigin = () => {

    try {
      const url = new URL(window.location.href);
      console.log('Bootstrap URL:', url.href);
      const parentOrigin = url.searchParams.get("parentOrigin");
      return isValidOrigin(parentOrigin) ? parentOrigin : null;
    } catch {
      return null;
    }

  }

  useEffect(() => {
    const expectedParentOrigin = getBootstrapParentOrigin();
    if (!expectedParentOrigin) {
      window.parent.postMessage({
        type: "error",
        message: "Missing or invalid parentOrigin parameter in URL",
      }, "*");

      console.error("Missing or invalid parentOrigin parameter in URL");


    } else {
      const threeModule = new ThreejsModule({
        container: containerRef.current,
        setLoading,
        setIsPending,
        setSpeakStates,
      })
      threeModuleRef.current = threeModule

    }

    return () => {
      threeModule.cleanup()

    }
  }, [])


  return (
    <>
      <EventsHandler threeModuleRef={threeModuleRef} />
      {
        loading != 'done' &&
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            zIndex: 1,
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            background: "radial-gradient(#ffffff, #7c7e90)",
          }}
        >
          <div>Loading...</div>
          <div>{loading}</div>
          <div>{((loading.split('%')[0] || 0) / 100 * 50.7).toFixed(1)}/50.7 MB</div>
        </div>
      }

      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: "#818181",
          // background: "radial-gradient(#ffffff, #7c7e90)",
          backgroundImage: bgImage ? "radial-gradient(#0000000d, #0d0d0d21), url('" + bgImage + "')" : "none",

          // backgroundImage: "radial-gradient(#0000000d, #0d0d0d70), url('./assets/images/Gemini_Generated_Image_bycqgrbycqgrbycq.png')",
          backgroundSize: "cover",
        }}
      >

      </div>


      {
        loading === 'done' && !isIframe &&
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            width: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: "18px",
            color: "#333",
            gap: "10px",
            left: "0",
          }}
        >
          {
            speakStates === "loaded" &&
            <button
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
              onClick={() => {
                threeModuleRef.current.connect();
              }}
            >
              Connect</button>
          }
          {
            speakStates === "connecting" &&
            <button
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <div className="spinner"></div>
              Connecting</button>
          }

          {
            speakStates === "connected" &&
            <button
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
              onClick={() => {
                threeModuleRef.current.start();
              }}
            >
              Start</button>
          }
          {
            speakStates === "ready" &&
            <button
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <div className="wave">
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
              </div>
              Speacking</button>
          }
          {
            speakStates === "ready" &&
            <button
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
              onClick={() => {
                threeModuleRef.current.stop();
              }}
            >
              Stop</button>
          }

        </div>
      }
    </>
  )
}

export default App

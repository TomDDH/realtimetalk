import { useRef, useEffect, useState } from 'react'
function EventsHandler({ threeModuleRef }) {

    const avatarThreejs = threeModuleRef.current

    useEffect(() => {
        console.log('EventsHandler mounted, setting up message listener')
        const handleMessage = (event) => {
            const hostOrigin = event.origin;
            const payload = event.data;
            console.log('Received message from host:', payload, 'Origin:', hostOrigin);
            if (!payload || !payload.type) {
                return;
            }
            switch (payload.type) {
                case 'Init':
                    console.log('Received Init message from host:', payload);
                    break;
                case 'connect':
                    avatarThreejs.connect(payload)
                    break;
                case 'stopSession':
                    avatarThreejs.stopConnection(payload)
                    break;
                case 'ping':
                    avatarThreejs.onPing(payload)
                    break;
                case 'SpeakBasic':
                    avatarThreejs.connect(payload)
                    break;
                // case 'SpeakStart':
                //     avatarThreejs.start(payload)
                //     break;
                case 'SpeakToken':
                    avatarThreejs.sendTextChat(payload)
                    break;
                default:
                    break;
            }
        }
        window.addEventListener('message', handleMessage)
        return () => {
            window.removeEventListener('message', handleMessage)
        }
    }, [avatarThreejs])



    return (
        <>

        </>
    )
}

export default EventsHandler

import { useRef, useEffect, useState } from 'react'

function Speeker({ threeModuleRef }) {

    const avatarThreejs = threeModuleRef.current
    const [speakers, setSpeakers] = useState([])


    useEffect(() => {

        const fetchAudioOutputDevices = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioOutputDevices = devices.filter(device => device.kind === 'audiooutput');
                setSpeakers(audioOutputDevices);
                console.log('Available audio output devices:', audioOutputDevices);
            } catch (error) {
                console.error('Error fetching audio output devices:', error);
            }
        }

        fetchAudioOutputDevices()


    }, [avatarThreejs])


    return (
        <div
            style={{
                position: 'absolute',
                right: 0,
                top: 0,
                zIndex: 1000,
            }}

        >
            <select
                onChange={(e) => {
                    console.log('Selected speaker device ID:', e.target.value);
                    avatarThreejs.updateSettings({
                        settings: {
                            speakerDeviceId: e.target.value,
                        }
                    })
                }}

            >
                {speakers.map((speaker) => (
                    <option key={speaker.deviceId}
                        value={speaker.deviceId}>
                        {speaker.label || `Speaker ${speaker.deviceId}`}
                    </option>
                ))}

            </select>
        </div>
    )
}

export default Speeker

import "./Message.css"


export enum MessageState {
    SUCCESS = "success",
    WARNING = "warning",
    ERROR = "error"
}


interface MessageProps {
    state: MessageState,
    children: React.ReactNode
}


export function Message(props: MessageProps) {

    return (
        <article className={`message ${props.state === MessageState.SUCCESS ? "success" :
                props.state === MessageState.WARNING ? "warning" :
                    "error"
            }`}>
            <div className="icon-wrapper">
                {
                    props.state === MessageState.SUCCESS ?
                        <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M19 0C8.5204 0 0 8.5204 0 19C0 29.4796 8.5204 38 19 38C29.4796 38 38 29.4796 38 19C38 8.5204 29.4796 0 19 0ZM28.6 14.7592L18.4408 26.32C18.0814 26.72 17.6002 26.9606 17.0814 26.9606H17.0018C16.5221 26.9606 16.0424 26.7606 15.6814 26.4013L9.47983 20.1593C8.75951 19.439 8.75951 18.239 9.47983 17.5186C10.2002 16.7983 11.4002 16.7983 12.1205 17.5186L16.9613 22.3594L25.8005 12.2798C26.4802 11.4798 27.6802 11.4392 28.4411 12.1205C29.2411 12.8001 29.3203 13.9592 28.6 14.7592Z" fill="#23C1AA"></path></svg>
                    : props.state === MessageState.ERROR ? 
                    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19 0C8.5204 0 0 8.5204 0 19C0 29.4796 8.5204 38 19 38C29.4796 38 38 29.4796 38 19C38 8.5204 29.4796 0 19 0Z" fill="#FF4D4D"></path>
                        <path d="M25.2 12.8C25.6 12.4 25.6 11.8 25.2 11.4C24.8 11 24.2 11 23.8 11.4L19 16.2L14.2 11.4C13.8 11 13.2 11 12.8 11.4C12.4 11.8 12.4 12.4 12.8 12.8L17.6 17.6L12.8 22.4C12.4 22.8 12.4 23.4 12.8 23.8C13.2 24.2 13.8 24.2 14.2 23.8L19 19L23.8 23.8C24.2 24.2 24.8 24.2 25.2 23.8C25.6 23.4 25.6 22.8 25.2 22.4L20.4 17.6L25.2 12.8Z" fill="white"></path>
                    </svg> : 
                    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19 0C8.5204 0 0 8.5204 0 19C0 29.4796 8.5204 38 19 38C29.4796 38 38 29.4796 38 19C38 8.5204 29.4796 0 19 0Z" fill="#FFA500"></path>
                        <path d="M18.5 10C18.5 9.44772 18.9477 9 19.5 9C20.0523 9 20.5 9.44772 20.5 10V22C20.5 22.5523 20.0523 23 19.5 23C18.9477 23 18.5 22.5523 18.5 22V10ZM19.5 28C20.3284 28 21 27.3284 21 26.5C21 25.6716 20.3284 25 19.5 25C18.6716 25 18 25.6716 18 26.5C18 27.3284 18.6716 28 19.5 28Z" fill="white"></path>
                    </svg>
                }
            </div>
            <div className="content-wrapper">
                {props.children}
            </div>
        </article>
    )
}
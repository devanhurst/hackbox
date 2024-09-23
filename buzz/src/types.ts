export interface Member {
  id: string;
  name: string;
  messages: [];
}

export interface Message {
  id: string;
  from: string;
  event: string;
  timestamp: number;
  message: { [key: string]: unknown };
}

export interface PrivateRoomState {
  members: { [id: string]: Member };
  messages: Message[];
}

export interface Component {
  type: string;
  props: { [key: string]: object };
}

export interface ThemeState {
  header: {
    text: string;
    color: string;
    background: string;
  };
  main: {
    background: string;
  };
}

export interface ComponentsState {
  main: Component[];
}

export interface MemberState {
  theme: ThemeState;
  components: ComponentsState;
}

type ChannelCallback<T> = (message: T) => void;

interface RegisteredChannel {
  channel: BroadcastChannel;
}

let channels: Map<string, RegisteredChannel> | undefined;

export const LOGOUT_CHANNEL = 'logout-channel';
export const LOGIN_CHANNEL = 'login-channel';

/**
 * Creates a new broadcast channel with the specified name and callback. The callback is called when a message is received,
 * receiving the message payload from other tabs.
 * If the channel already exists, the function returns false.
 * @param channelName name of the channel
 * @param callback function to be called when a message is received
 * @returns true if the channel was created, false if the channel already exists
 * @see broadcastMessage
 */
export const createBroadcastChannel = <T = void>(
  channelName: string,
  callback: ChannelCallback<T>,
): boolean => {
  if (channels === undefined) {
    channels = new Map<string, RegisteredChannel>();
  }
  if (channels.has(channelName)) {
    return false;
  }
  const channel = new BroadcastChannel(channelName);
  channel.onmessage = (event: MessageEvent<T>) => {
    callback(event.data);
  };
  channels.set(channelName, { channel });
  return true;
};

/**
 * Broadcasts a message to all subscribers of the channel in OTHER tabs. The channel must be created before broadcasting.
 * The posting tab does not receive its own message.
 * If the channel is not found, an error is thrown.
 * @param channelName name of the channel
 * @param message to be broadcasted or undefined
 * @see createBroadcastChannel
 */
export const broadcastMessage = (
  channelName: string,
  message?: string,
): void => {
  if (channels === undefined) {
    throw new Error('No channels created');
  }
  const registered = channels.get(channelName);
  if (registered === undefined) {
    throw new Error(`Channel ${channelName} not found`);
  }
  registered.channel.postMessage(message);
};

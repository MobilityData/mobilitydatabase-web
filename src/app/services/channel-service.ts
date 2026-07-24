type ChannelCallback<T> = (message: T) => void;

interface RegisteredChannel {
  channel: BroadcastChannel;
  callback: ChannelCallback<unknown>;
}

let channels: Map<string, RegisteredChannel> | undefined;

export const LOGOUT_CHANNEL = 'logout-channel';
export const LOGIN_CHANNEL = 'login-channel';

/** Channel used to keep user feature flags in sync within and across tabs. */
export const FEATURE_FLAGS_CHANNEL = 'feature-flags-channel';

/**
 * Creates a new broadcast channel with the specified name and callback. The callback is called when a message is received,
 * receiving the message payload from other tabs (or from broadcastExtendedMessage in the same tab).
 * If the channel already exists, the function returns false.
 * @param channelName name of the channel
 * @param callback function to be called when a message is received
 * @returns true if the channel was created, false if the channel already exists
 * @see broadcastMessage
 * @see broadcastExtendedMessage
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
  channels.set(channelName, {
    channel,
    callback: callback as ChannelCallback<unknown>,
  });
  return true;
};

/**
 * Broadcasts a message to all subscribers of the channel in OTHER tabs. The channel must be created before broadcasting.
 * The posting tab does not receive its own message — use broadcastExtendedMessage when the current tab must react too.
 * If the channel is not found, an error is thrown.
 * @param channelName name of the channel
 * @param message to be broadcasted or undefined
 * @see createBroadcastChannel
 * @see broadcastExtendedMessage
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

/**
 * Broadcasts a typed message to other tabs AND delivers it to the current tab.
 *
 * BroadcastChannel.postMessage does not deliver to the posting context, so the
 * channel's locally-registered callback is invoked directly to keep the current
 * tab in sync. The channel must have been created via createBroadcastChannel.
 * If the channel is not found, an error is thrown.
 * @param channelName name of the channel
 * @param message payload delivered to every tab, including the current one
 * @see createBroadcastChannel
 */
export const broadcastExtendedMessage = <T>(
  channelName: string,
  message: T,
): void => {
  if (channels === undefined) {
    throw new Error('No channels created');
  }
  const registered = channels.get(channelName);
  if (registered === undefined) {
    throw new Error(`Channel ${channelName} not found`);
  }
  // Cross-tab: other tabs receive the payload via their onmessage handler.
  registered.channel.postMessage(message);
  // Same-tab: BroadcastChannel skips the sender, so invoke the callback here.
  registered.callback(message);
};

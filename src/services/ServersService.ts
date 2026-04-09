import { singleton } from 'tsyringe';
import { serversArr } from '../config/servers';
import type { MarketAlertSettings } from '../types/types';

@singleton()
export class ServersService {
  /**
   * Retrieves the IDs of all servers the user is allowed to access.
   */
  public getAvailableServerIds(allowedServers: number[] | 'ALL' = 'ALL'): number[] {
    if (allowedServers === 'ALL') {
      return serversArr.map((_, i) => i);
    }
    return allowedServers;
  }

  /**
   * Retrieves the list of currently selected servers based on the available servers.
   * Filters out any servers from settings that are no longer allowed.
   */
  public getSelectedServers(settings: MarketAlertSettings): number[] {
    const availableServerIds = this.getAvailableServerIds(settings.allowedServers);
    
    if (settings.servers === 'ALL') {
      return [...availableServerIds];
    }
    
    return (settings.servers || []).filter(id => availableServerIds.includes(id));
  }

  /**
   * Toggles a single server.
   * Returns a newly updated settings object. Throws an error if server is not allowed.
   */
  public toggleServer(settings: MarketAlertSettings, serverId: number): MarketAlertSettings {
    const availableServerIds = this.getAvailableServerIds(settings.allowedServers);

    if (!availableServerIds.includes(serverId)) {
      throw new Error('У вас нет доступа к этому серверу!');
    }

    let selectedServers = this.getSelectedServers(settings);

    if (selectedServers.includes(serverId)) {
      selectedServers = selectedServers.filter(id => id !== serverId);
    } else {
      selectedServers.push(serverId);
    }

    const updatedSettings = { ...settings };
    if (selectedServers.length === availableServerIds.length) {
      updatedSettings.servers = 'ALL';
    } else {
      updatedSettings.servers = selectedServers;
    }

    return updatedSettings;
  }

  /**
   * Toggles all available servers on or off.
   * Returns a newly updated settings object.
   */
  public toggleAllServers(settings: MarketAlertSettings): MarketAlertSettings {
    const availableServerIds = this.getAvailableServerIds(settings.allowedServers);
    const selectedServers = this.getSelectedServers(settings);
    
    const isAll = selectedServers.length === availableServerIds.length;
    
    return {
      ...settings,
      servers: isAll ? [] : 'ALL'
    };
  }

  /**
   * Checks if a server matches both the user's allowed servers and their currently selected settings.
   */
  public isServerMatch(settings: MarketAlertSettings, serverId: number): boolean {
    const allowedServers = settings.allowedServers ?? 'ALL';
    
    if (allowedServers === 'ALL') {
      return settings.servers === 'ALL' || settings.servers.includes(serverId);
    } else {
      const isAllowed = allowedServers.includes(serverId);
      const isSelected = settings.servers === 'ALL' || settings.servers.includes(serverId);
      return isAllowed && isSelected;
    }
  }
}

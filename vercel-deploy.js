/**
 * Vercel Deployment Helper
 * Despliega proyectos en Vercel desde MyCloud
 */

const fetch = require('node-fetch');

class VercelDeployer {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://api.vercel.com';
  }

  /**
   * Crear un nuevo deployment desde un ZIP
   * @param {string} projectName - Nombre del proyecto
   * @param {Buffer} zipBuffer - Contenido del archivo ZIP
   * @param {object} env - Variables de entorno (opcional)
   * @returns {Promise<object>} - URL del deployment
   */
  async deployFromZip(projectName, zipBuffer, env = {}) {
    const url = `${this.baseUrl}/v10/deployments`;

    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'multipart/form-data',
    };

    const formData = new FormData();
    formData.append('file', new Blob([zipBuffer]), `${projectName}.zip`);
    formData.append('name', projectName);
    formData.append('prod', 'true');

    // Agregar variables de entorno
    if (Object.keys(env).length > 0) {
      formData.append('environmentVariables', JSON.stringify(env));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Vercel API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      url: `https://${data.url}`,
      deploymentId: data.id,
      previewUrl: `https://${data.url}`,
      prodUrl: data.url,
    };
  }

  /**
   * Crear deployment desde GitHub
   * @param {string} repoUrl - URL del repositorio
   * @param {string} projectName - Nombre del proyecto
   * @param {object} env - Variables de entorno
   * @returns {Promise<object>} - URL del deployment
   */
  async deployFromGitHub(repoUrl, projectName, env = {}) {
    const url = `${this.baseUrl}/v6/deployments`;

    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };

    const body = {
      name: projectName,
      repo: repoUrl,
      prod: true,
      environmentVariables: env,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Vercel API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      url: `https://${data.url}`,
      deploymentId: data.id,
      previewUrl: `https://${data.url}`,
      prodUrl: data.url,
    };
  }

  /**
   * Listar deployments de un proyecto
   * @param {string} projectId - ID del proyecto
   * @returns {Promise<object[]>} - Lista de deployments
   */
  async listDeployments(projectId) {
    const url = `${this.baseUrl}/v10/deployments?projectId=${projectId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Vercel API error: ${response.status}`);
    }

    const data = await response.json();
    return data.deployments;
  }

  /**
   * Obtener URL de producción de un deployment
   * @param {string} deploymentId - ID del deployment
   * @returns {Promise<string>} - URL de producción
   */
  async getProductionUrl(deploymentId) {
    const url = `${this.baseUrl}/v10/deployments/${deploymentId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Vercel API error: ${response.status}`);
    }

    const data = await response.json();
    return data.url;
  }
}

module.exports = { VercelDeployer };

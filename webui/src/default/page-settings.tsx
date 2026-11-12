/********************************************************************************
 * Copyright (c) 2020 TypeFox and others
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 ********************************************************************************/

import { FunctionComponent, ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { Typography, Box, Link } from '@mui/material';
import { Link as RouteLink, Route, useParams } from 'react-router';
import GitHubIcon from '@mui/icons-material/GitHub';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import BugReportIcon from '@mui/icons-material/BugReport';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { Extension, NamespaceDetails } from '../extension-registry-types';
import { PageSettings } from '../page-settings';
import { ExtensionListRoutes } from '../pages/extension-list/extension-list-routes';
import { DefaultMenuContent, MobileMenuContent } from './menu-content';
import About from './about';
import { createAbsoluteURL } from '../utils';

const WIKI_URL = 'https://github.com/eclipse-openvsx/openvsx/wiki';
const REPO_URL = 'https://github.com/eclipse-openvsx/openvsx';
const ISSUES_URL = `${REPO_URL}/issues`;

export default function createPageSettings(prefersDarkMode: boolean, serverUrl: string): PageSettings {
    const toolbarContent: FunctionComponent = () => (
        <RouteLink
            to={ExtensionListRoutes.MAIN}
            aria-label='BlackWhi Store home'
            // A bare anchor would leak the browser's link colors into the wordmark.
            style={{ display: 'flex', color: 'inherit' }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '0.55rem' }}>
                <Typography
                    component='span'
                    sx={{
                        fontFamily: 'Georgia, serif',
                        fontWeight: 800,
                        fontSize: '1.65rem',
                        letterSpacing: '-0.06em',
                        lineHeight: 1,
                        color: 'inherit'
                    }}>
                    BlackWhi
                </Typography>
                <Typography
                    component='span'
                    sx={{ fontWeight: 700, fontSize: '0.625rem', letterSpacing: '0.18em', color: 'inherit' }}>
                    STORE
                </Typography>
            </Box>
        </RouteLink>
    );

    const footer: PageSettings['elements']['footer'] = {
        brand: {
            logo: (
                <Box
                    component='span'
                    sx={{
                        fontFamily: 'Georgia, serif',
                        fontWeight: 800,
                        letterSpacing: '-0.06em',
                        fontSize: '1.5rem',
                        lineHeight: 1
                    }}>
                    BW
                </Box>
            ),
            name: 'BlackWhi Store',
            description:
                'FIT package catalog built on the Eclipse Open VSX open-source codebase (EPL-2.0). Upstream attribution and notices are retained.'
        },
        columns: [
            {
                heading: 'Resources',
                links: [{ label: 'Documentation', href: WIKI_URL }]
            },
            {
                heading: 'Community',
                links: [
                    { label: 'GitHub', href: REPO_URL, external: true },
                    { label: 'About This Service', href: '/about' }
                ]
            }
        ],
        social: [{ title: 'GitHub', href: REPO_URL, icon: <GitHubIcon sx={{ fontSize: '1rem' }} /> }],
        copyright: (
            <>
                Copyright &copy; 2026 by{' '}
                <Link href='https://www.eclipse.org' target='_blank' underline='hover'>
                    Eclipse Foundation
                </Link>
            </>
        ),
        showVersion: true
    };

    const home: PageSettings['elements']['home'] = {
        popularSearches: ['python', 'git', 'docker', 'prettier', 'eslint', 'rust', 'java'],
        involvement: {
            heading: 'Get Involved',
            cards: [
                {
                    icon: <CallSplitIcon />,
                    title: 'Contribute',
                    description: 'Open VSX is fully open source. Help build the registry the ecosystem depends on.',
                    href: REPO_URL,
                    label: 'View on GitHub →'
                },
                {
                    icon: <BugReportIcon />,
                    title: 'Report an issue',
                    description: 'Found a bug or have a feature request? Open an issue and help improve the registry.',
                    href: ISSUES_URL,
                    label: 'Open an issue →'
                },
                {
                    icon: <MenuBookIcon />,
                    title: 'Read the docs',
                    description: 'Learn how to publish, claim namespaces, and consume extensions via the API.',
                    href: WIKI_URL,
                    label: 'View documentation →'
                }
            ]
        }
    };

    const searchHeader: FunctionComponent = () => (
        <Box textAlign='center' sx={{ mb: 2, maxWidth: '43.75rem', mx: 'auto' }}>
            <Box
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    px: '0.8125rem',
                    py: '0.375rem',
                    borderRadius: theme => `${theme.shape.borderRadiusPill}px`,
                    bgcolor: 'accentSoft',
                    color: 'secondary.light',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    mb: 2
                }}>
                <Box
                    component='span'
                    sx={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        bgcolor: 'secondary.main',
                        display: 'inline-block',
                        flexShrink: 0
                    }}
                />
                Open-source registry for VS Code–compatible editors
            </Box>
            <Typography
                component='h1'
                sx={{
                    fontSize: { xs: '1.875rem', sm: '2.5rem', md: '2.875rem' },
                    lineHeight: 1.1,
                    letterSpacing: '-0.02em',
                    fontWeight: 600,
                    mb: 1.5
                }}>
                Find the right extension,
                <br />
                for any editor.
            </Typography>
            <Typography
                sx={{ fontSize: '1.125rem', color: 'text.secondary', maxWidth: '35rem', mx: 'auto', lineHeight: 1.5 }}>
                Browse community-published extensions. <br />
                Free, open, and vendor-neutral.
            </Typography>
        </Box>
    );

    const additionalRoutes: ReactNode = <Route path='/about' element={<About />} />;

    const headTags: FunctionComponent<{ title: string }> = props => {
        return (
            <Helmet>
                <title>{props.title}</title>
            </Helmet>
        );
    };

    const mainHeadTags: FunctionComponent<{ pageSettings: PageSettings }> = props => {
        return headTags({ title: props.pageSettings.pageTitle });
    };

    const extensionHeadTags: FunctionComponent<{ extension?: Extension; pageSettings: PageSettings }> = props => {
        const params = useParams();
        const name = props.extension ? (props.extension.displayName ?? props.extension.name) : params.name;

        return headTags({ title: `${name} – ${props.pageSettings.pageTitle}` });
    };

    const namespaceHeadTags: FunctionComponent<{
        namespaceDetails?: NamespaceDetails;
        name: string;
        pageSettings: PageSettings;
    }> = props => {
        const name = props.namespaceDetails
            ? (props.namespaceDetails.displayName ?? props.namespaceDetails.name)
            : props.name;

        return headTags({ title: `${name} – ${props.pageSettings.pageTitle}` });
    };

    return {
        pageTitle: 'BlackWhi Store',
        themeType: prefersDarkMode ? 'dark' : 'light',
        publisherAgreement: {
            name: 'Open VSX'
        },
        elements: {
            toolbarContent,
            defaultMenuContent: DefaultMenuContent,
            mobileMenuContent: MobileMenuContent,
            footer,
            home,
            searchHeader,
            additionalRoutes,
            mainHeadTags,
            extensionHeadTags,
            namespaceHeadTags
        },
        urls: {
            extensionDefaultIcon: '/default-icon.png',
            namespaceAccessInfo: 'https://github.com/eclipse/openvsx/wiki/Namespace-Access',
            publisherAgreement: createAbsoluteURL([serverUrl, 'api', 'publisher-agreement']),
            trustedPublishing: 'https://github.com/eclipse-openvsx/openvsx/wiki/Trusted-Publishing'
        }
    };
}

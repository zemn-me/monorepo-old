import Eye from '@zemn.me/art/time';
import * as i8n from '@zemn.me/linear/i8n';
import Head from 'next/head';
import { years } from '@zemn.me/article';
import Error from 'pages/error/[code]'
import { must } from '@zemn.me/linear/guard';
import * as articles from '@zemn.me/article';
import style from './s.module.sass';
import * as indexer from '@zemn.me/linear/indexer'
import MDXProvider from '@zemn.me/linear/MDXProvider';
import React from 'react';
import { classes } from '@zemn.me/linear/classes';
import { useRouter } from 'next/router';
import { A, Nav, Ord, Prose, Section, Header, Main, Div, Heading } from '@zemn.me/linear';

export interface IndexProps {
    className?: string
}


interface IndexSectionProps extends indexer.TreeNode { }

const IndexSection:
    (props: IndexSectionProps) => React.ReactElement
=
    ({self, children}) => <>
        {self?<li><IndexSectionHeader {...self}/></li>:null}
        {children&&children.length?<ol>
            {children.map((child, i) => <IndexSection key={i} {...child}/>)}
        </ol>:null}
    </>
;

export const Index:
    (props: IndexProps) => React.ReactElement | null
=
    ({ className }) => {
        const ind = React.useContext(indexer.context);
        let [ tree = {}, setTree ] = React.useState<indexer.TreeNode>();

        if (tree.children?.length == 1) tree = {
            children: tree.children[0].children
        }

        React.useEffect(() => {
            if (!ind) return;
            const [destroy] = ind.onChange(setTree);
            return destroy;
        }, [ ind, setTree ]);


        return <Nav {...{
            ...classes(className)  
        }}>
            <IndexSection {...tree}/>
        </Nav>
    }
;

const IndexSectionHeader:
    (props: indexer.RegisterProps) => React.ReactElement
=
    ({ title, anchor }) => {
        const u = new URL(document.location!.toString());
        u.hash = anchor;
        return <A href={u}>{title}</A>
    }
;

interface PostProps {
    title: React.ReactElement
    subtitle: React.ReactElement
    date: React.ReactElement
    article: React.ReactElement
    author: React.ReactElement
}

const M: React.FC = ({ children }) => {
    const index = React.useMemo(() => new indexer.Ctx, []);
    
    return <Main className={style.Main}>
        <MDXProvider>
            <indexer.context.Provider value={index}>
                {children}
            </indexer.context.Provider>
        </MDXProvider>
    </Main>
}

const Post:
    (props: PostProps) => React.ReactElement
=
    ({ title, subtitle, date, article, author }) => <M>
            <Header className={style.Header}>
                <div className={style.Sticker}>
                    <Heading>{title}</Heading>
                    <Div className={style.Subtitle}>{subtitle}</Div>
                    <Div className={style.Author}>{author}</Div>
                    <Div className={style.Date}>{date}</Div>
                    <Div className={style.Index}>
                        <Index/>
                    </Div>
                </div>
            </Header>
            <Section className={style.Article}>
                <Prose>
                {article}
                </Prose>
            </Section>

    </M>
;




export interface DatedProps {
    date: Date
}

export const Dated:
    (props: DatedProps) => React.ReactElement
=
    ({ date }) => <>
        {date.getMonth()} {date.getFullYear()}
    </>
;

const X = () => {
    const { query: { year, name } } = useRouter();

    if (year == undefined || year instanceof Array ||
        name == undefined || name instanceof Array)
        return <Error code="404"/>


    const article = years?.[+year]?.[name];

    if (article == undefined) return <Error code="404"/>



    return <>
        <Head>
            <title>{article.title}</title>
        </Head>
        <Post {...{
            title: <>{article.title}</>,
            subtitle: <>{article.inShort}</>,
            date: <i8n.Date date={article.date!}/>,
            article: <article.Component/>,
            author: <>{"nobody"}</>,

        }}/>
    </>

}

export default X;

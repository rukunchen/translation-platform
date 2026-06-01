import { NextRequest, NextResponse } from 'next/server'
import { isPlatformAdmin } from '@/lib/platformAdmin'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

const ADMIN_EMAIL = 'rukunchen@hotmail.com'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type TermCategoryRow = {
  id: string
  name: string
  parent_id: string | null
  level: number | null
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = supabaseAdmin()
  const isEmailAdmin = user.email?.toLowerCase() === ADMIN_EMAIL
  if (!isEmailAdmin && !(await isPlatformAdmin(user, admin))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { categoryId } = await params
  if (!UUID_PATTERN.test(categoryId)) {
    return NextResponse.json({ error: '分类 ID 无效' }, { status: 400 })
  }

  const { data: categoryData, error: categoryError } = await admin
    .from('term_categories')
    .select('id, name, parent_id, level')
    .eq('id', categoryId)
    .maybeSingle()

  if (categoryError) return NextResponse.json({ error: categoryError.message }, { status: 500 })
  if (!categoryData) return NextResponse.json({ error: '分类不存在' }, { status: 404 })

  const category = categoryData as TermCategoryRow
  const { data: childRows, error: childError } = await admin
    .from('term_categories')
    .select('id')
    .eq('parent_id', category.id)
    .limit(1)

  if (childError) return NextResponse.json({ error: childError.message }, { status: 500 })
  if ((childRows ?? []).length > 0) {
    return NextResponse.json({ error: '该分类下仍有子分类，不能直接删除。请先处理子分类。' }, { status: 400 })
  }

  const { data: termRows, error: termListError } = await admin
    .from('public_terms')
    .select('id')
    .eq('category_id', category.id)

  if (termListError) return NextResponse.json({ error: termListError.message }, { status: 500 })

  const termIds = (termRows ?? []).map(row => row.id as string)
  if (termIds.length > 0) {
    const { error: termbookError } = await admin
      .from('user_termbook_items')
      .update({ public_term_id: null })
      .in('public_term_id', termIds)
    if (termbookError) return NextResponse.json({ error: termbookError.message }, { status: 500 })

    const termTestQuestionResult = await admin
      .from('term_test_questions')
      .update({ public_term_id: null })
      .in('public_term_id', termIds)
    if (termTestQuestionResult.error && termTestQuestionResult.error.code !== '42P01') {
      return NextResponse.json({ error: termTestQuestionResult.error.message }, { status: 500 })
    }
  }

  const termTestAttemptResult = await admin
    .from('term_test_attempts')
    .update({ category_id: null })
    .eq('category_id', category.id)
  if (termTestAttemptResult.error && termTestAttemptResult.error.code !== '42P01') {
    return NextResponse.json({ error: termTestAttemptResult.error.message }, { status: 500 })
  }

  const { error: deleteTermsError } = await admin
    .from('public_terms')
    .delete()
    .eq('category_id', category.id)
  if (deleteTermsError) return NextResponse.json({ error: deleteTermsError.message }, { status: 500 })

  const { error: deleteCategoryError } = await admin
    .from('term_categories')
    .delete()
    .eq('id', category.id)
  if (deleteCategoryError) return NextResponse.json({ error: deleteCategoryError.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    categoryId: category.id,
    categoryName: category.name,
    deletedTerms: termIds.length,
  })
}
